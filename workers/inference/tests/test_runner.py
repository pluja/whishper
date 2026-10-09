import asyncio
import json
from pathlib import Path

import httpx
import pytest
from support import (
    FailingAdapter,
    GatedAdapter,
    RecordingClient,
    ScriptedProgressClient,
    SlowFakeAdapter,
    network_error,
    status_error,
    transcription_lease,
    worker_settings,
)

from anysub_worker import runner
from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.client import ApplicationClient, LeaseLostError
from anysub_worker.media import PreparedMedia
from anysub_worker.models import (
    JobFailure,
    MediaDerivativeUpload,
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaPreparationJobPayload,
    MediaProbeArtifact,
    TranscriptionJobPayload,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry


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
    assert client.failures == []


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
    assert client.failures == []


async def test_heartbeat_recovers_after_network_error(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runner, "LEASE_HEARTBEAT_SECONDS", 0.01)
    client = ScriptedProgressClient([None, network_error(), network_error()])
    adapter = GatedAdapter()

    async def release_after_recovery() -> None:
        await client.recovered.wait()
        adapter.release.set()

    releaser = asyncio.create_task(release_after_recovery())
    await asyncio.wait_for(
        runner._execute(client, AdapterRegistry((adapter,)), transcription_lease()),  # type: ignore[arg-type]
        timeout=2,
    )
    await releaser

    assert client.transcription_completions == 1
    assert client.failures == []


async def test_heartbeat_lease_conflict_abandons_the_job(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runner, "LEASE_HEARTBEAT_SECONDS", 0.01)
    client = ScriptedProgressClient([None, LeaseLostError("job-1")])

    await asyncio.wait_for(
        runner._execute(client, AdapterRegistry((GatedAdapter(),)), transcription_lease()),  # type: ignore[arg-type]
        timeout=2,
    )

    assert client.transcription_completions == 0
    assert client.failures == []


async def test_progress_errors_do_not_fail_the_job() -> None:
    client = ScriptedProgressClient([network_error()] * 10)

    await runner._execute(  # type: ignore[arg-type]
        client, AdapterRegistry((FakeAdapter(),)), transcription_lease()
    )

    assert client.transcription_completions == 1
    assert client.failures == []


async def test_lease_conflict_on_completion_is_not_reported_as_failure() -> None:
    class LostOnCompleteClient(RecordingClient):
        async def complete_transcription(self, *_args) -> None:  # type: ignore[no-untyped-def]
            raise LeaseLostError("job-1")

    client = LostOnCompleteClient()

    await runner._execute(  # type: ignore[arg-type]
        client, AdapterRegistry((FakeAdapter(),)), transcription_lease()
    )

    assert client.failures == []


async def test_shutdown_cancels_the_job_and_reports_retryable_failure() -> None:
    client = RecordingClient()
    execution = asyncio.create_task(
        runner._execute(  # type: ignore[arg-type]
            client, AdapterRegistry((GatedAdapter(),)), transcription_lease()
        )
    )
    while not client.progress_updates:
        await asyncio.sleep(0)

    execution.cancel()
    with pytest.raises(asyncio.CancelledError):
        await execution

    assert client.transcription_completions == 0
    assert [(failure.code, failure.retryable) for failure in client.failures] == [
        ("adapter_error", True)
    ]


async def test_rejected_request_fails_the_job_permanently_with_response_detail() -> None:
    client = RecordingClient()
    adapter = FailingAdapter(status_error(400, "invalid artifact"))

    await runner._execute(client, AdapterRegistry((adapter,)), transcription_lease())  # type: ignore[arg-type]

    assert client.failures == [
        JobFailure(
            code="adapter_error",
            message="HTTPStatusError: 400 Bad Request: invalid artifact",
            retryable=False,
        )
    ]


async def test_unprocessable_completion_fails_the_job_permanently_with_its_reason(
    tmp_path: Path, respx_mock
) -> None:  # type: ignore[no-untyped-def]
    client = ApplicationClient(worker_settings(tmp_path), AdapterRegistry(()))
    respx_mock.post("http://app.test/api/internal/jobs/job-1/progress").mock(
        return_value=httpx.Response(200, json={"accepted": True})
    )
    complete = respx_mock.post("http://app.test/api/internal/jobs/job-1/complete").mock(
        return_value=httpx.Response(422, json={"message": "Adapter cues are not ordered."})
    )
    fail = respx_mock.post("http://app.test/api/internal/jobs/job-1/fail").mock(
        return_value=httpx.Response(200, json={"accepted": True})
    )

    try:
        await runner._execute(client, AdapterRegistry((FakeAdapter(),)), transcription_lease())
    finally:
        await client.close()

    assert complete.call_count == 1
    report = json.loads(fail.calls.last.request.content)
    assert report["error"] == {
        "code": "adapter_error",
        "message": "HTTPStatusError: 422 Unprocessable Entity: Adapter cues are not ordered.",
        "retryable": False,
    }
