import asyncio
from pathlib import Path

import httpx
import pytest

from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.config import WorkerSettings
from anysub_worker.models import JobFailure, TranscriptionJobPayload, WorkerLease


def worker_settings(tmp_path: Path) -> WorkerSettings:
    return WorkerSettings(
        app_url="http://app.test",
        worker_token="test-worker-token-0123456789",
        data_root=tmp_path,
        model_root=tmp_path / "models",
        worker_id_file=tmp_path / "worker-id",
    )


class SlowFakeAdapter(FakeAdapter):
    async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
        await asyncio.sleep(0.04)
        return await super().transcribe(request, report_progress)


class RecordingClient:
    def __init__(self) -> None:
        self.progress_updates: list[tuple[float, str]] = []
        self.transcription_completions = 0
        self.media_completions = 0
        self.failures: list[JobFailure] = []
        self.downloads = 0
        self.uploads: list[tuple[str, bytes]] = []

    async def progress(self, lease, progress: float, message: str) -> None:  # type: ignore[no-untyped-def]
        self.progress_updates.append((progress, message))

    async def complete_transcription(self, *args) -> None:  # type: ignore[no-untyped-def]
        self.transcription_completions += 1

    async def download_source(self, _lease, destination: Path) -> None:  # type: ignore[no-untyped-def]
        self.downloads += 1
        destination.write_bytes(b"source")

    async def upload_artifact(self, _lease, kind: str, path: Path) -> None:  # type: ignore[no-untyped-def]
        self.uploads.append((kind, path.read_bytes()))

    async def complete_media_preparation(self, *_args) -> None:  # type: ignore[no-untyped-def]
        self.media_completions += 1

    async def fail(self, _lease, failure: JobFailure) -> None:  # type: ignore[no-untyped-def]
        self.failures.append(failure)


class GatedAdapter(FakeAdapter):
    def __init__(self) -> None:
        self.release = asyncio.Event()

    async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
        await self.release.wait()
        return await super().transcribe(request, report_progress)


class FailingAdapter(FakeAdapter):
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
        raise self.error


class ScriptedProgressClient(RecordingClient):
    """Raises the scripted progress outcomes in order, then accepts every report."""

    def __init__(self, outcomes: list[Exception | None]) -> None:
        super().__init__()
        self.outcomes = outcomes
        self.recovered = asyncio.Event()
        self.saw_error = False

    async def progress(self, lease, progress: float, message: str) -> None:  # type: ignore[no-untyped-def]
        outcome = self.outcomes.pop(0) if self.outcomes else None
        if outcome is not None:
            self.saw_error = True
            raise outcome
        if self.saw_error:
            self.recovered.set()
        await super().progress(lease, progress, message)


def transcription_lease() -> WorkerLease:
    return WorkerLease(
        jobId="job-1",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-07-19T00:00:00Z",
        payload=TranscriptionJobPayload(
            kind="transcribe",
            adapterId="builtin.fake",
            modelId="fake-v1",
            projectId="project-1",
            runId="run-1",
            options={"delayMs": 0},
        ),
    )


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
