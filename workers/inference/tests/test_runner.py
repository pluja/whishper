import asyncio
from pathlib import Path

import httpx

from anysub_worker import runner
from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.client import ApplicationClient
from anysub_worker.config import WorkerSettings
from anysub_worker.media import PreparedMedia
from anysub_worker.models import (
    MediaDerivativeUpload,
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaPreparationJobPayload,
    MediaProbeArtifact,
    TranscriptionJobPayload,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry


class SlowFakeAdapter(FakeAdapter):
    async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
        await asyncio.sleep(0.04)
        return await super().transcribe(request, report_progress)


class RecordingClient:
    def __init__(self) -> None:
        self.progress_updates: list[tuple[float, str]] = []
        self.transcription_completions = 0
        self.media_completions = 0
        self.failures = 0
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

    async def fail(self, *args) -> None:  # type: ignore[no-untyped-def]
        self.failures += 1


async def test_long_adapter_work_renews_its_lease(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runner, "LEASE_HEARTBEAT_SECONDS", 0.01)
    client = RecordingClient()
    lease = WorkerLease(
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

    await runner._execute(  # type: ignore[arg-type]
        client,
        AdapterRegistry((SlowFakeAdapter(),)),
        lease,
    )

    assert len(client.progress_updates) >= 4
    assert client.transcription_completions == 1
    assert client.failures == 0


async def test_media_job_uploads_derivatives_before_completion(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    completion = MediaPreparationJobCompletion(
        probe=MediaProbeArtifact(
            durationUs=2_000_000,
            formatNames=("wav",),
            seekable=True,
            frameRateMode="unknown",
            proxyRecommended=False,
            proxyReasons=(),
            streams=(),
        ),
        artifacts=(
            MediaDerivativeUpload(
                kind="waveform",
                mediaType="application/vnd.anysub.waveform+json",
                sizeBytes=8,
            ),
        ),
        generator=MediaGenerator(version="7.1.1"),
    )

    async def fake_prepare_media(
        _source_path: Path,
        _source_filename: str,
        output_directory: Path,
        report_progress,
    ) -> PreparedMedia:  # type: ignore[no-untyped-def]
        output_directory.mkdir()
        waveform = output_directory / "waveform.json"
        waveform.write_bytes(b"waveform")
        await report_progress(0.86, "Built waveform")
        return PreparedMedia(
            completion=completion,
            artifacts={"waveform": waveform},
        )

    monkeypatch.setattr(runner, "prepare_media", fake_prepare_media)
    client = RecordingClient()
    lease = WorkerLease(
        jobId="job-media",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-07-21T00:00:00Z",
        payload=MediaPreparationJobPayload(
            kind="media_prepare",
            projectId="project-1",
            sourceStorageKey="workspaces/workspace-1/source.wav",
            sourceFilename="source.wav",
        ),
    )

    await runner._execute(client, AdapterRegistry(()), lease)  # type: ignore[arg-type]

    assert client.downloads == 1
    assert client.uploads == [("waveform", b"waveform")]
    assert client.media_completions == 1
    assert client.transcription_completions == 0
    assert client.failures == 0


async def test_artifact_upload_declares_binary_content_type(tmp_path: Path, respx_mock) -> None:  # type: ignore[no-untyped-def]
    settings = WorkerSettings(
        app_url="http://app.test",
        worker_token="test-token",
        data_root=tmp_path,
        model_root=tmp_path / "models",
        worker_id_file=tmp_path / "worker-id",
    )
    client = ApplicationClient(settings, AdapterRegistry(()))
    lease = WorkerLease(
        jobId="job-media",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-07-21T00:00:00Z",
        payload=MediaPreparationJobPayload(
            kind="media_prepare",
            projectId="project-1",
            sourceStorageKey="source.wav",
            sourceFilename="source.wav",
        ),
    )
    artifact = tmp_path / "waveform.json"
    artifact.write_bytes(b"waveform")
    url = "http://app.test/api/internal/jobs/job-media/artifacts/waveform"
    respx_mock.head(url).mock(return_value=httpx.Response(200, headers={"Upload-Offset": "0"}))
    patch = respx_mock.patch(url).mock(
        return_value=httpx.Response(204, headers={"Upload-Offset": "8"})
    )

    try:
        await client.upload_artifact(lease, "waveform", artifact)
    finally:
        await client.close()

    request = patch.calls.last.request
    assert request.headers["content-type"] == "application/offset+octet-stream"
    assert request.content == b"waveform"
