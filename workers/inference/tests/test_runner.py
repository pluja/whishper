import asyncio
import os
import signal
from pathlib import Path

import httpx
import pytest

from anysub_worker import runner
from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.client import ApplicationClient, LeaseLostError
from anysub_worker.config import WorkerSettings
from anysub_worker.media import PreparedMedia
from anysub_worker.models import (
    JobFailure,
    LeaseResponse,
    MediaDerivativeUpload,
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaPreparationJobPayload,
    MediaProbeArtifact,
    TranscriptionJobPayload,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry


def worker_settings(tmp_path: Path) -> WorkerSettings:
    return WorkerSettings(
        app_url="http://app.test",
        worker_token="test-token",
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


async def test_artifact_upload_declares_binary_content_type(tmp_path: Path, respx_mock) -> None:  # type: ignore[no-untyped-def]
    client = ApplicationClient(worker_settings(tmp_path), AdapterRegistry(()))
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


@pytest.mark.parametrize(
    ("error", "message", "retryable"),
    [
        (RuntimeError("disk full"), "RuntimeError: disk full", True),
        (TimeoutError(), "TimeoutError", True),
        (status_error(503, "busy"), "HTTPStatusError: 503 Service Unavailable: busy", True),
        (
            status_error(422, ""),
            f"HTTPStatusError: 422 {httpx.codes.UNPROCESSABLE_ENTITY.phrase}",
            False,
        ),
        (status_error(409, "stale"), "HTTPStatusError: 409 Conflict: stale", True),
    ],
)
def test_unexpected_failures_are_described_with_their_type(
    error: Exception, message: str, retryable: bool
) -> None:
    failure = runner._failure_for(error, "media_prepare")

    assert failure == JobFailure(
        code="media_preparation_error", message=message, retryable=retryable
    )


@pytest.mark.parametrize(
    ("body", "expected_detail"),
    [
        ('{"message": "artifact too large", "code": 1}', "artifact too large"),
        ("<html><body><h1>Bad Gateway</h1>\n<p>nginx</p></body></html>", "Bad Gateway"),
        ("\n\n  first line  \nsecond", "first line"),
        ("x" * 1000, "x" * runner.MAX_RESPONSE_DETAIL_CHARS),
    ],
)
def test_http_status_errors_never_expose_urls(body: str, expected_detail: str) -> None:
    message = runner.describe_error(status_error(502, body))

    assert message == f"HTTPStatusError: 502 Bad Gateway: {expected_detail}"
    assert "app.test" not in message
    assert "mozilla" not in message


class StopPolling(Exception):
    pass


async def test_invalid_lease_response_backs_off_instead_of_crashing(
    tmp_path: Path, respx_mock
) -> None:  # type: ignore[no-untyped-def]
    client = ApplicationClient(worker_settings(tmp_path), AdapterRegistry(()))
    respx_mock.post("http://app.test/api/internal/workers/lease").mock(
        side_effect=[
            httpx.Response(200, json={"lease": {"jobId": "job-1"}}),
            httpx.Response(200, text="not json"),
            httpx.Response(200, json={"lease": None, "pollAfterMs": 500}),
        ]
    )
    delays: list[float] = []

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 3:
            raise StopPolling

    try:
        with pytest.raises(StopPolling):
            await runner.poll_forever(
                client, AdapterRegistry(()), sleep=record_sleep, jitter=lambda: 1.0
            )
    finally:
        await client.close()

    assert delays == [1, 2, 0.5]


@pytest.mark.parametrize(
    ("consecutive_failures", "jitter", "expected"),
    [(1, 0.0, 0.5), (1, 1.0, 1), (3, 1.0, 4), (6, 1.0, 30), (500, 1.0, 30), (500, 0.0, 15)],
)
def test_poll_backoff_grows_exponentially_up_to_the_cap(
    consecutive_failures: int, jitter: float, expected: float
) -> None:
    assert runner.poll_backoff_seconds(consecutive_failures, jitter) == expected


async def test_sigterm_stops_the_worker_and_closes_the_client(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    class IdleClient:
        worker_id = "worker-1"
        closed = False

        def __init__(self, *_args) -> None:  # type: ignore[no-untyped-def]
            pass

        async def lease(self):  # type: ignore[no-untyped-def]
            await asyncio.Event().wait()

        async def close(self) -> None:
            IdleClient.closed = True

    monkeypatch.setattr(runner, "ApplicationClient", IdleClient)
    asyncio.get_running_loop().call_later(0.05, os.kill, os.getpid(), signal.SIGTERM)

    await asyncio.wait_for(
        runner.run_forever(worker_settings(tmp_path), AdapterRegistry(())), timeout=2
    )

    assert IdleClient.closed


async def test_unexpected_execute_errors_do_not_kill_the_poll_loop(monkeypatch, caplog) -> None:  # type: ignore[no-untyped-def]
    polls = 0

    class ScriptedClient:
        async def lease(self) -> LeaseResponse:
            nonlocal polls
            polls += 1
            if polls > 1:
                raise StopPolling
            return LeaseResponse(lease=transcription_lease(), pollAfterMs=100)

    async def crash(*_args) -> None:  # type: ignore[no-untyped-def]
        raise httpx.InvalidURL("bad url")

    monkeypatch.setattr(runner, "_execute", crash)

    with pytest.raises(StopPolling):
        await runner.poll_forever(ScriptedClient(), AdapterRegistry(()))  # type: ignore[arg-type]

    assert polls == 2
    assert "job execution crashed" in caplog.text
