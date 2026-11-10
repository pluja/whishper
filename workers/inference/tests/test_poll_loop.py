import asyncio
import os
import signal
import threading

import httpx
import pytest
import respx
from fakes import FakeAdapter, RecordingClient, ScriptedProgressClient, StopPolling, wait_until

from anysub_worker import execution, runner
from anysub_worker.adapter import ProgressReporter
from anysub_worker.client import ApplicationClient
from anysub_worker.config import WorkerSettings
from anysub_worker.errors import LeaseLostError, UnreadableJobError
from anysub_worker.models import (
    JobLease,
    LeaseResponse,
    TranscriptArtifact,
    TranscriptionRequest,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry
from anysub_worker.threads import run_in_thread


class LeaseOnceClient(RecordingClient):
    def __init__(self, lease: WorkerLease, *, polls_before_stop: int | None = None) -> None:
        super().__init__()
        self._lease = lease
        self._polls_before_stop = polls_before_stop
        self.polls = 0

    async def lease(self) -> LeaseResponse:
        self.polls += 1
        if self._polls_before_stop is not None and self.polls > self._polls_before_stop:
            raise StopPolling
        return LeaseResponse(lease=self._lease, pollAfterMs=100)


async def crash(*_args: object) -> None:
    raise httpx.InvalidURL("bad url")


async def test_invalid_lease_response_backs_off_instead_of_crashing(
    settings: WorkerSettings, respx_mock: respx.MockRouter
) -> None:
    client = ApplicationClient(settings, AdapterRegistry(()))
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


async def test_an_unreadable_job_fails_permanently_and_polling_goes_on() -> None:
    class UnreadableOnceClient(RecordingClient):
        def __init__(self) -> None:
            super().__init__()
            self.polls = 0

        async def lease(self) -> LeaseResponse:
            self.polls += 1
            if self.polls == 1:
                raise UnreadableJobError(JobLease(jobId="job-1", leaseToken="lease-token"))
            raise StopPolling

    client = UnreadableOnceClient()

    with pytest.raises(StopPolling):
        await runner.poll_forever(client, AdapterRegistry(()))

    assert [(failure.code, failure.retryable) for failure in client.failures] == [
        ("adapter_unavailable", False)
    ]
    assert client.polls == 2


async def test_sigterm_stops_the_worker_and_closes_the_client(
    settings: WorkerSettings, monkeypatch: pytest.MonkeyPatch
) -> None:
    class IdleClient:
        worker_id = "worker-1"
        hardware_summary = "device=cpu"
        closed = False

        def __init__(self, *_args: object) -> None:
            pass

        async def lease(self) -> LeaseResponse:
            await asyncio.Event().wait()
            raise AssertionError("the idle lease never returns")

        async def close(self) -> None:
            IdleClient.closed = True

    monkeypatch.setattr(runner, "ApplicationClient", IdleClient)
    asyncio.get_running_loop().call_later(0.05, os.kill, os.getpid(), signal.SIGTERM)

    await asyncio.wait_for(runner.run_forever(settings, AdapterRegistry(())), timeout=2)

    assert IdleClient.closed


async def test_unexpected_execute_errors_do_not_kill_the_poll_loop(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    transcription_lease: WorkerLease,
) -> None:
    client = LeaseOnceClient(transcription_lease, polls_before_stop=1)
    delays: list[float] = []

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr(runner, "execute_job", crash)

    with pytest.raises(StopPolling):
        await runner.poll_forever(
            client, AdapterRegistry(()), sleep=record_sleep, jitter=lambda: 1.0
        )

    assert client.polls == 2
    assert delays == [1]
    assert "job execution crashed" in caplog.text


async def test_repeated_execute_crashes_back_off_exponentially(
    monkeypatch: pytest.MonkeyPatch, transcription_lease: WorkerLease
) -> None:
    delays: list[float] = []

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 3:
            raise StopPolling

    monkeypatch.setattr(runner, "execute_job", crash)

    with pytest.raises(StopPolling):
        await runner.poll_forever(
            LeaseOnceClient(transcription_lease),
            AdapterRegistry(()),
            sleep=record_sleep,
            jitter=lambda: 1.0,
        )

    assert delays == [1, 2, 4]


async def test_an_abandoned_inference_thread_finishes_before_the_next_lease(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    transcription_lease: WorkerLease,
) -> None:
    monkeypatch.setattr(execution, "LEASE_HEARTBEAT_SECONDS", 0.01)
    monkeypatch.setattr(runner, "PRESENCE_SECONDS", 0.01)
    started = threading.Event()
    release_thread = threading.Event()
    thread_finished = threading.Event()

    def blocking_inference() -> None:
        started.set()
        release_thread.wait(timeout=5)
        thread_finished.set()

    class ThreadedAdapter(FakeAdapter):
        async def transcribe(
            self, request: TranscriptionRequest, report_progress: ProgressReporter
        ) -> TranscriptArtifact:
            await run_in_thread(blocking_inference)
            return await super().transcribe(request, report_progress)

    class LosingClient(ScriptedProgressClient):
        def __init__(self) -> None:
            super().__init__([None, LeaseLostError("job-1")])
            self.leases = 0
            self.thread_finished_at_second_lease: bool | None = None

        async def lease(self) -> LeaseResponse:
            self.leases += 1
            if self.leases == 1:
                return LeaseResponse(lease=transcription_lease, pollAfterMs=100)
            self.thread_finished_at_second_lease = thread_finished.is_set()
            raise StopPolling

        async def announce(self) -> None:
            await super().announce()
            if self.announcements == 1:
                raise httpx.ConnectError("application restarting")

    client = LosingClient()
    polling = asyncio.create_task(
        runner.poll_forever(client, AdapterRegistry((ThreadedAdapter(),)))
    )
    await asyncio.to_thread(started.wait, 5)
    await wait_until(lambda: "waiting for 1 abandoned inference call" in caplog.text)
    await wait_until(lambda: client.announcements >= 3)
    assert "presence announcement failed" in caplog.text
    assert client.leases == 1
    assert not polling.done()

    release_thread.set()
    with pytest.raises(StopPolling):
        await asyncio.wait_for(polling, timeout=5)

    assert client.thread_finished_at_second_lease is True
    assert client.transcription_completions == 0
