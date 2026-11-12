from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from pathlib import Path
from time import time

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ..adapter import AdapterExecutionError
from ..errors import describe_error, response_detail
from ..models import RemoteModelAccess
from ..retry import Backoff, Sleep

LOGGER = logging.getLogger(__name__)
READ_TIMEOUT_SECONDS = 600
REQUEST_TIMEOUT = httpx.Timeout(connect=15, read=READ_TIMEOUT_SECONDS, write=120, pool=15)
REQUEST_ATTEMPTS = 5
RETRY_BACKOFF = Backoff(base_seconds=2, cap_seconds=60)
MAX_RESPONSE_BYTES = 32 * 1024 * 1024
RETRYABLE_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
# Words that a provider's error mentions when the model cannot return timestamps.
TIMESTAMP_ERROR_HINTS = ("verbose_json", "timestamp", "response_format")


class RemoteTranscriptionError(AdapterExecutionError):
    """Final for the job. Each request already retried itself, and a new job
    attempt would send every part again, and the provider may bill it again."""

    def __init__(self, message: str) -> None:
        super().__init__(message, retryable=False)


class _Inbound(BaseModel):
    # An infinite or missing timestamp cannot be placed on the timeline.
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)


class ApiWord(_Inbound):
    word: str
    start: float
    end: float


class ApiSegment(_Inbound):
    start: float
    end: float
    text: str


class VerboseTranscript(_Inbound):
    text: str = ""
    language: str | None = None
    duration: float | None = None
    segments: list[ApiSegment] = Field(default_factory=list)
    words: list[ApiWord] = Field(default_factory=list)

    # Some servers send null for a timing list they did not fill.
    @field_validator("segments", "words", mode="before")
    @classmethod
    def _null_list_is_empty(cls, value: object) -> object:
        return [] if value is None else value


@dataclass(frozen=True)
class SpeechApi:
    access: RemoteModelAccess
    client: httpx.AsyncClient
    sleep: Sleep = asyncio.sleep

    async def transcribe(self, audio: Path, language: str | None) -> VerboseTranscript:
        failures = 0
        while True:
            try:
                response = await self._post(audio, language)
            except httpx.ReadTimeout as error:
                # The provider got the audio and may bill it, so a resend could
                # pay twice for one transcription.
                raise RemoteTranscriptionError(
                    f"{self.access.provider_name} did not answer within "
                    f"{READ_TIMEOUT_SECONDS / 60:g} minutes.",
                ) from error
            except httpx.TransportError as error:
                failures += 1
                if failures >= REQUEST_ATTEMPTS:
                    raise RemoteTranscriptionError(
                        f"Could not reach {self.access.provider_name}: {describe_error(error)}",
                    ) from error
                await self._wait(failures, None, describe_error(error))
                continue
            if response.status_code in RETRYABLE_STATUSES:
                failures += 1
                if failures >= REQUEST_ATTEMPTS:
                    raise self._failure(response)
                await self._wait(failures, response, f"HTTP {response.status_code}")
                continue
            if response.is_error:
                raise self._failure(response)
            return self._parse(response)

    async def _post(self, audio: Path, language: str | None) -> httpx.Response:
        fields: dict[str, str | list[str]] = {
            "model": self.access.model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": ["segment", "word"],
        }
        if language:
            fields["language"] = language
        api_key = self.access.api_key
        headers = {"Authorization": f"Bearer {api_key.get_secret_value()}"} if api_key else {}
        request = self.client.build_request(
            "POST",
            f"{self.access.base_url.rstrip('/')}/audio/transcriptions",
            data=fields,
            files={"file": (audio.name, audio.read_bytes(), "audio/mpeg")},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        return await self._send_limited(request)

    # A transcript of one part is a few megabytes at most. A larger answer is
    # not one, and reading it whole would only use up the worker's memory.
    async def _send_limited(self, request: httpx.Request) -> httpx.Response:
        response = await self.client.send(request, stream=True)
        body = bytearray()
        try:
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) > MAX_RESPONSE_BYTES:
                    raise RemoteTranscriptionError(
                        f"{self.access.provider_name} answered with more than "
                        f"{MAX_RESPONSE_BYTES // (1024 * 1024)} MB, which is not a transcript."
                    )
        finally:
            await response.aclose()
        # The body is already decoded, so the copy must not decode it again.
        headers = [
            (name, value)
            for name, value in response.headers.raw
            if name.lower() not in (b"content-encoding", b"content-length")
        ]
        return httpx.Response(
            response.status_code, headers=headers, content=bytes(body), request=request
        )

    async def _wait(self, failures: int, response: httpx.Response | None, reason: str) -> None:
        requested = _retry_after_seconds(response)
        delay = RETRY_BACKOFF.delay_seconds(failures) if requested is None else requested
        delay = min(delay, RETRY_BACKOFF.cap_seconds)
        LOGGER.warning(
            "%s request failed (%s), retrying in %.1fs", self.access.provider_name, reason, delay
        )
        await self.sleep(delay)

    def _parse(self, response: httpx.Response) -> VerboseTranscript:
        try:
            body = response.json()
        except json.JSONDecodeError as error:
            raise RemoteTranscriptionError(
                f"{self.access.provider_name} did not answer with JSON. Check that the "
                "base URL points to an OpenAI-compatible API.",
            ) from error
        try:
            transcript = VerboseTranscript.model_validate(body)
        except ValidationError as error:
            raise RemoteTranscriptionError(
                f"{self.access.provider_name} returned a transcript Anysub cannot read: "
                f"{_first_problem(error)}.",
            ) from error
        if transcript.text.strip() and not transcript.segments and not transcript.words:
            raise _no_timestamps(self.access)
        return transcript

    def _failure(self, response: httpx.Response) -> RemoteTranscriptionError:
        provider = self.access.provider_name
        detail = self._detail(response)
        status = response.status_code
        suffix = f" ({detail})" if detail else ""
        if status in (401, 403):
            return RemoteTranscriptionError(
                f"{provider} rejected the API key{suffix}. Check the key in "
                "Administration, External providers.",
            )
        if status == 404:
            return RemoteTranscriptionError(
                f"{provider} has no model named {self.access.model}, or the base URL is "
                f"wrong{suffix}.",
            )
        if status == 413:
            return RemoteTranscriptionError(f"{provider} refused the audio as too large{suffix}.")
        if status == 429:
            return RemoteTranscriptionError(
                f"{provider} kept limiting requests{suffix}. Try again later, or raise the "
                "account's limits.",
            )
        if response.is_server_error or status in RETRYABLE_STATUSES:
            return RemoteTranscriptionError(
                f"{provider} failed with HTTP {status}{suffix}. Try again later."
            )
        if any(hint in detail.lower() for hint in TIMESTAMP_ERROR_HINTS):
            return _no_timestamps(self.access)
        return RemoteTranscriptionError(
            f"{provider} refused the request with HTTP {status}{suffix}."
        )

    # Some servers echo the key in their errors, and the message reaches users.
    def _detail(self, response: httpx.Response) -> str:
        detail = response_detail(response)
        if self.access.api_key:
            detail = detail.replace(self.access.api_key.get_secret_value(), "[API key]")
        return detail


def _first_problem(error: ValidationError) -> str:
    problem = error.errors()[0]
    field = ".".join(str(part) for part in problem["loc"]) or "the response"
    return f"{field}: {problem['msg']}"


def _no_timestamps(access: RemoteModelAccess) -> RemoteTranscriptionError:
    return RemoteTranscriptionError(
        f"{access.model} on {access.provider_name} does not return timestamps, which "
        "subtitles need. Choose a Whisper model instead.",
    )


def _retry_after_seconds(response: httpx.Response | None) -> float | None:
    if response is None:
        return None
    value = response.headers.get("retry-after")
    if not value:
        return None
    with suppress(ValueError):
        return max(0.0, float(value))
    with suppress(TypeError, ValueError):
        return max(0.0, parsedate_to_datetime(value).timestamp() - time())
    return None
