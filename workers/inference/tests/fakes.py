from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from anysub_worker.adapter import ProgressReporter
from anysub_worker.models import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    JobCompletion,
    JobFailure,
    JobLease,
    ModelCacheJobCompletion,
    TranscriptArtifact,
    TranscriptCue,
    TranscriptionRequest,
    WordToken,
    WorkerLease,
)


class FakeAdapter:
    @property
    def manifest(self) -> AdapterManifest:
        return AdapterManifest(
            id="builtin.fake",
            displayName="Deterministic test adapter",
            version="0.1.0",
            description="Produces a fixed transcript without loading a model.",
            models=(
                AdapterModel(
                    id="fake-v1",
                    displayName="Fake model",
                    capabilities=(AdapterCapability.TRANSCRIBE,),
                    languages="all",
                    optionsSchema={
                        "type": "object",
                        "properties": {
                            "delayMs": {"type": "integer", "minimum": 0, "maximum": 2000}
                        },
                        "additionalProperties": False,
                    },
                ),
            ),
        )

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        delay_seconds = int(request.options.get("delayMs", 20)) / 1000
        await report_progress(0.1, "Preparing deterministic transcript")
        await asyncio.sleep(delay_seconds)
        await report_progress(0.6, "Normalizing word timestamps")
        await asyncio.sleep(delay_seconds)

        words = (
            WordToken(id="word-1", text="Private", startUs=0, endUs=480_000, confidence=1),
            WordToken(
                id="word-2",
                text="subtitles,",
                startUs=500_000,
                endUs=1_100_000,
                confidence=1,
            ),
            WordToken(id="word-3", text="on", startUs=1_180_000, endUs=1_360_000, confidence=1),
            WordToken(id="word-4", text="your", startUs=1_400_000, endUs=1_650_000, confidence=1),
            WordToken(
                id="word-5",
                text="machine.",
                startUs=1_700_000,
                endUs=2_200_000,
                confidence=1,
            ),
        )
        artifact = TranscriptArtifact(
            language=request.language or "en",
            durationUs=2_500_000,
            cues=(
                TranscriptCue(
                    id="cue-1",
                    startUs=0,
                    endUs=2_300_000,
                    text="Private subtitles, on your machine.",
                    words=words,
                ),
            ),
            metadata={"deterministic": True},
        )
        await report_progress(1, "Transcript ready")
        return artifact


class SlowFakeAdapter(FakeAdapter):
    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        await asyncio.sleep(0.04)
        return await super().transcribe(request, report_progress)


class RecordingClient:
    def __init__(self) -> None:
        self.progress_updates: list[tuple[float, str]] = []
        self.transcription_completions = 0
        self.media_completions = 0
        self.model_cache_completions: list[ModelCacheJobCompletion] = []
        self.failures: list[JobFailure] = []
        self.downloads = 0
        self.download_names: list[str] = []
        self.uploads: list[tuple[str, bytes]] = []
        self.announcements = 0

    async def announce(self) -> None:
        self.announcements += 1

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        self.progress_updates.append((progress, message))

    async def fetch_source(self, lease: WorkerLease, storage_key: str, download_to: Path) -> Path:
        self.downloads += 1
        self.download_names.append(download_to.name)
        download_to.write_bytes(b"source")
        return download_to

    async def upload_artifact(self, lease: WorkerLease, kind: str, artifact_path: Path) -> None:
        self.uploads.append((kind, artifact_path.read_bytes()))

    async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None:
        if completion.kind == "transcribe":
            self.transcription_completions += 1
        elif completion.kind == "model_cache":
            self.model_cache_completions.append(completion)
        else:
            self.media_completions += 1

    async def fail(self, lease: JobLease, failure: JobFailure) -> None:
        self.failures.append(failure)


class CachingFakeAdapter(FakeAdapter):
    def __init__(self) -> None:
        self.downloaded: list[str] = []
        self.deleted: list[str] = []

    async def download_model(self, model_id: str, report_progress: ProgressReporter) -> None:
        await report_progress(0.5, "Downloading")
        self.downloaded.append(model_id)

    async def delete_model(self, model_id: str) -> None:
        self.deleted.append(model_id)


class GatedAdapter(FakeAdapter):
    def __init__(self) -> None:
        self.release = asyncio.Event()

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        await self.release.wait()
        return await super().transcribe(request, report_progress)


class FailingAdapter(FakeAdapter):
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        raise self.error


class ScriptedProgressClient(RecordingClient):
    """Raises the scripted progress outcomes in order, then accepts every report."""

    def __init__(self, outcomes: list[Exception | None]) -> None:
        super().__init__()
        self.outcomes = outcomes
        self.recovered = asyncio.Event()
        self.saw_error = False

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        outcome = self.outcomes.pop(0) if self.outcomes else None
        if outcome is not None:
            self.saw_error = True
            raise outcome
        if self.saw_error:
            self.recovered.set()
        await super().progress(lease, progress, message)


def network_error() -> httpx.ConnectError:
    return httpx.ConnectError("connection refused")


def status_error(status_code: int, body: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://app.test/api/internal/jobs/job-1/complete")
    response = httpx.Response(status_code, text=body, request=request)
    with pytest.raises(httpx.HTTPStatusError) as raised:
        response.raise_for_status()
    return raised.value


class StopPolling(Exception):
    pass


async def wait_until(condition: Callable[[], bool], timeout: float = 5) -> None:
    async with asyncio.timeout(timeout):
        while not condition():
            await asyncio.sleep(0.01)


class RecordedSleeps(list[float]):
    async def __call__(self, seconds: float) -> None:
        self.append(seconds)
