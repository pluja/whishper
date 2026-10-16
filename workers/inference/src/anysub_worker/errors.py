from __future__ import annotations

import json
import re
from contextlib import suppress
from typing import ClassVar

import httpx

MAX_RESPONSE_DETAIL_CHARS = 200
HTML_TAG = re.compile(r"<[^>]*>")


class JobError(RuntimeError):
    """A job failure whose message is safe to show and whose retry policy is explicit."""

    code: ClassVar[str]

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class LeaseLostError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"lease for job {job_id} is no longer active")


def is_transient(error: httpx.HTTPError) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.is_server_error
    return isinstance(error, httpx.TransportError)


def describe_error(error: BaseException) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        response = error.response
        message = f"{type(error).__name__}: {response.status_code} {response.reason_phrase}"
        with suppress(httpx.ResponseNotRead):
            detail = _summarize_response_body(response)
            if detail:
                message = f"{message}: {detail}"
        return message
    return f"{type(error).__name__}: {error}" if str(error) else type(error).__name__


def _summarize_response_body(response: httpx.Response) -> str:
    text = response.text
    with suppress(ValueError, RecursionError):
        body = json.loads(text)
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            text = body["message"]
    for line in HTML_TAG.sub(" ", text).splitlines():
        collapsed = " ".join(line.split())
        if collapsed:
            return collapsed[:MAX_RESPONSE_DETAIL_CHARS]
    return ""
