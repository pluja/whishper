import asyncio
import json
from pathlib import Path

import httpx
import pytest
import respx
from fakes import (
    FailingAdapter,
    FakeAdapter,
    GatedAdapter,
    RecordingClient,
    ScriptedProgressClient,
    SlowFakeAdapter,
    network_error,
    status_error,
)
from pydantic import SecretStr

from anysub_worker import execution
from anysub_worker.adapter import ProgressReporter
from anysub_worker.client import ApplicationClient
from anysub_worker.config import WorkerSettings
from anysub_worker.errors import LeaseLostError
from anysub_worker.media.derivatives import prepared_derivative
from anysub_worker.media.prepare import PreparedMedia
from anysub_worker.models import (
    REMOTE_ADAPTER_ID,
    JobCompletion,
    JobFailure,
    MediaGenerator,
    MediaProbeArtifact,
    RemoteModelAccess,
    TranscriptArtifact,
    TranscriptionRequest,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry


async def test_long_adapter_work_renews_its_lease(
    monkeypatch: pytest.MonkeyPatch,
    recording_client: RecordingClient,
    transcription_lease: WorkerLease,
) -> None:
    monkeypatch.setattr(execution, "LEASE_HEARTBEAT_SECONDS", 0.01)

    await execution.execute_job(
        recording_client,
        AdapterRegistry((SlowFakeAdapter(),)),
        transcription_lease,
    )

    assert len(recording_client.progress_updates) >= 4
    assert recording_client.transcription_completions == 1
    assert recording_client.failures == []


async def test_media_job_uploads_derivatives_before_completion(
    monkeypatch: pytest.MonkeyPatch, recording_client: RecordingClient, media_lease: WorkerLease
) -> None:
    probe = MediaProbeArtifact(
        durationUs=2_000_000,
        formatNames=("wav",),
        seekable=True,
        frameRateMode="unknown",
        proxyRecommended=False,
        proxyReasons=(),
        streams=(),
    )

    async def fake_prepare_media(
        source_path: Path,
        source_filename: str,
        output_directory: Path,
        report_progress: ProgressReporter,
    ) -> PreparedMedia:
        output_directory.mkdir()
        waveform = output_directory / "waveform.json"
        waveform.write_bytes(b"waveform")
        await report_progress(0.5, "Building waveform")
        await report_progress(1.0, "Preparing derivatives for upload")
        return PreparedMedia(
            probe=probe,
            derivatives=(
                prepared_derivative(
                    "waveform", "application/vnd.anysub.waveform+json", waveform, {}
                ),
            ),
            generator=MediaGenerator(version="7.1.1"),
        )

    monkeypatch.setattr(execution, "prepare_media", fake_prepare_media)

    await execution.execute_job(recording_client, AdapterRegistry(()), media_lease)

    assert recording_client.downloads == 1
    assert recording_client.download_names == ["source.wav"]
    assert recording_client.uploads == [("waveform", b"waveform")]
    assert recording_client.media_completions == 1
    assert recording_client.transcription_completions == 0
    assert recording_client.failures == []
    progress = [fraction for fraction, _message in recording_client.progress_updates]
    assert progress == sorted(progress)
    assert progress[0] >= 0 and progress[-1] < 1


async def test_heartbeat_recovers_after_network_error(
    monkeypatch: pytest.MonkeyPatch, transcription_lease: WorkerLease
) -> None:
    monkeypatch.setattr(execution, "LEASE_HEARTBEAT_SECONDS", 0.01)
    client = ScriptedProgressClient([None, network_error(), network_error()])
    adapter = GatedAdapter()

    async def release_after_recovery() -> None:
        await client.recovered.wait()
        adapter.release.set()

    releaser = asyncio.create_task(release_after_recovery())
    await asyncio.wait_for(
        execution.execute_job(client, AdapterRegistry((adapter,)), transcription_lease),
        timeout=2,
    )
    await releaser

    assert client.transcription_completions == 1
    assert client.failures == []


async def test_heartbeat_lease_conflict_abandons_the_job(
    monkeypatch: pytest.MonkeyPatch, transcription_lease: WorkerLease
) -> None:
    monkeypatch.setattr(execution, "LEASE_HEARTBEAT_SECONDS", 0.01)
    client = ScriptedProgressClient([None, LeaseLostError("job-1")])

    await asyncio.wait_for(
        execution.execute_job(client, AdapterRegistry((GatedAdapter(),)), transcription_lease),
        timeout=2,
    )

    assert client.transcription_completions == 0
    assert client.failures == []


async def test_progress_errors_do_not_fail_the_job(transcription_lease: WorkerLease) -> None:
    client = ScriptedProgressClient([network_error()] * 10)

    await execution.execute_job(client, AdapterRegistry((FakeAdapter(),)), transcription_lease)

    assert client.transcription_completions == 1
    assert client.failures == []


async def test_lease_conflict_on_completion_is_not_reported_as_failure(
    transcription_lease: WorkerLease,
) -> None:
    class LostOnCompleteClient(RecordingClient):
        async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None:
            raise LeaseLostError("job-1")

    client = LostOnCompleteClient()

    await execution.execute_job(client, AdapterRegistry((FakeAdapter(),)), transcription_lease)

    assert client.failures == []


async def test_shutdown_cancels_the_job_and_reports_retryable_failure(
    recording_client: RecordingClient, transcription_lease: WorkerLease
) -> None:
    running = asyncio.create_task(
        execution.execute_job(
            recording_client, AdapterRegistry((GatedAdapter(),)), transcription_lease
        )
    )
    while not recording_client.progress_updates:
        await asyncio.sleep(0)

    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await running

    assert recording_client.transcription_completions == 0
    assert [(failure.code, failure.retryable) for failure in recording_client.failures] == [
        ("adapter_error", True)
    ]


async def test_rejected_request_fails_the_job_permanently_with_response_detail(
    recording_client: RecordingClient, transcription_lease: WorkerLease
) -> None:
    adapter = FailingAdapter(status_error(400, "invalid artifact"))

    await execution.execute_job(recording_client, AdapterRegistry((adapter,)), transcription_lease)

    assert recording_client.failures == [
        JobFailure(
            code="adapter_error",
            message="HTTPStatusError: 400 Bad Request: invalid artifact",
            retryable=False,
        )
    ]


async def test_unprocessable_completion_fails_the_job_permanently_with_its_reason(
    settings: WorkerSettings, transcription_lease: WorkerLease, respx_mock: respx.MockRouter
) -> None:
    client = ApplicationClient(settings, AdapterRegistry(()))
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
        await execution.execute_job(client, AdapterRegistry((FakeAdapter(),)), transcription_lease)
    finally:
        await client.close()

    assert complete.call_count == 1
    report = json.loads(fail.calls.last.request.content)
    assert report["error"] == {
        "code": "adapter_error",
        "message": "HTTPStatusError: 422 Unprocessable Entity: Adapter cues are not ordered.",
        "retryable": False,
    }


def test_stale_work_directories_are_removed_at_startup(tmp_path: Path) -> None:
    leftover = tmp_path / f"{execution.WORK_DIRECTORY_PREFIX}abc123"
    (leftover / "artifacts").mkdir(parents=True)
    (leftover / "artifacts" / "proxy.mp4").write_bytes(b"proxy")
    unrelated = tmp_path / "other-tool-xyz"
    unrelated.mkdir()

    execution.remove_stale_work_directories(tmp_path)

    assert not leftover.exists()
    assert unrelated.exists()


class CompletionRecordingClient(RecordingClient):
    def __init__(self) -> None:
        super().__init__()
        self.completions: list[JobCompletion] = []

    async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None:
        self.completions.append(completion)
        await super().complete(lease, completion)


async def test_remote_jobs_run_on_the_provider_named_in_the_lease(
    monkeypatch: pytest.MonkeyPatch, transcription_lease: WorkerLease
) -> None:
    access = RemoteModelAccess(
        providerName="Groq",
        baseUrl="https://api.groq.test",
        apiKey=SecretStr("key"),
        model="whisper",
    )
    lease = transcription_lease.model_copy(
        update={
            "payload": transcription_lease.payload.model_copy(
                update={"adapter_id": REMOTE_ADAPTER_ID, "model_id": "model-row"}
            ),
            "remote": access,
        }
    )
    used: list[RemoteModelAccess] = []

    async def transcribe(
        request: TranscriptionRequest, given: RemoteModelAccess, report: ProgressReporter
    ) -> TranscriptArtifact:
        used.append(given)
        return TranscriptArtifact(language="en", durationUs=0, cues=())

    monkeypatch.setattr(execution, "transcribe_remotely", transcribe)
    client = CompletionRecordingClient()

    await execution.execute_job(client, AdapterRegistry(()), lease)

    assert used == [access]
    completion = client.completions[0]
    assert completion.kind == "transcribe"
    assert completion.adapter.id == REMOTE_ADAPTER_ID
    assert completion.adapter.model_id == "whisper"


async def test_remote_job_without_provider_details_fails_for_good(
    recording_client: RecordingClient, transcription_lease: WorkerLease
) -> None:
    lease = transcription_lease.model_copy(
        update={
            "payload": transcription_lease.payload.model_copy(
                update={"adapter_id": REMOTE_ADAPTER_ID}
            )
        }
    )

    await execution.execute_job(recording_client, AdapterRegistry(()), lease)

    assert recording_client.failures[0].code == "adapter_unavailable"
    assert recording_client.failures[0].retryable is False
