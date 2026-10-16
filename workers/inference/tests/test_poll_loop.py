import asyncio
import os
import signal
import threading

import httpx
import pytest
from fakes import FakeAdapter, ScriptedProgressClient, StopPolling

from anysub_worker import execution, runner
from anysub_worker.client import ApplicationClient
from anysub_worker.config import WorkerSettings
from anysub_worker.errors import LeaseLostError
from anysub_worker.models import LeaseResponse, WorkerLease
from anysub_worker.registry import AdapterRegistry
from anysub_worker.threads import run_in_thread


async def test_invalid_lease_response_backs_off_instead_of_crashing(
    settings: WorkerSettings, respx_mock
) -> None:  # type: ignore[no-untyped-def]
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


async def test_sigterm_stops_the_worker_and_closes_the_client(
    settings: WorkerSettings, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
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

    await asyncio.wait_for(runner.run_forever(settings, AdapterRegistry(())), timeout=2)

    assert IdleClient.closed


async def test_unexpected_execute_errors_do_not_kill_the_poll_loop(
    monkeypatch, caplog, transcription_lease: WorkerLease
) -> None:  # type: ignore[no-untyped-def]
    polls = 0
    delays: list[float] = []

    class ScriptedClient:
        async def lease(self) -> LeaseResponse:
            nonlocal polls
            polls += 1
            if polls > 1:
                raise StopPolling
            return LeaseResponse(lease=transcription_lease, pollAfterMs=100)

    async def crash(*_args) -> None:  # type: ignore[no-untyped-def]
        raise httpx.InvalidURL("bad url")

    monkeypatch.setattr(runner, "execute_job", crash)

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)

    with pytest.raises(StopPolling):
        await runner.poll_forever(  # type: ignore[arg-type]
            ScriptedClient(), AdapterRegistry(()), sleep=record_sleep, jitter=lambda: 1.0
        )

    assert polls == 2
    assert delays == [1]
    assert "job execution crashed" in caplog.text


async def test_repeated_execute_crashes_back_off_exponentially(
    monkeypatch, transcription_lease: WorkerLease
) -> None:  # type: ignore[no-untyped-def]
    class ScriptedClient:
        async def lease(self) -> LeaseResponse:
            return LeaseResponse(lease=transcription_lease, pollAfterMs=100)

    async def crash(*_args) -> None:  # type: ignore[no-untyped-def]
        raise httpx.InvalidURL("bad url")

    delays: list[float] = []

    async def record_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 3:
            raise StopPolling

    monkeypatch.setattr(runner, "execute_job", crash)

    with pytest.raises(StopPolling):
        await runner.poll_forever(  # type: ignore[arg-type]
            ScriptedClient(), AdapterRegistry(()), sleep=record_sleep, jitter=lambda: 1.0
        )

    assert delays == [1, 2, 4]


async def test_an_abandoned_inference_thread_finishes_before_the_next_lease(
    monkeypatch, transcription_lease: WorkerLease
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(execution, "LEASE_HEARTBEAT_SECONDS", 0.01)
    started = threading.Event()
    release_thread = threading.Event()
    thread_finished = threading.Event()

    def blocking_inference() -> None:
        started.set()
        release_thread.wait(timeout=5)
        thread_finished.set()

    class ThreadedAdapter(FakeAdapter):
        async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
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

    client = LosingClient()
    polling = asyncio.create_task(
        runner.poll_forever(client, AdapterRegistry((ThreadedAdapter(),)))  # type: ignore[arg-type]
    )
    await asyncio.to_thread(started.wait, 5)
    for _ in range(100):
        await asyncio.sleep(0.01)
    assert client.leases == 1
    assert not polling.done()

    release_thread.set()
    with pytest.raises(StopPolling):
        await asyncio.wait_for(polling, timeout=5)

    assert client.thread_finished_at_second_lease is True
    assert client.transcription_completions == 0
