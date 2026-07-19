import asyncio

from anysub_worker import runner
from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.models import TranscriptionJobPayload, WorkerLease
from anysub_worker.registry import AdapterRegistry


class SlowFakeAdapter(FakeAdapter):
    async def transcribe(self, request, report_progress):  # type: ignore[no-untyped-def]
        await asyncio.sleep(0.04)
        return await super().transcribe(request, report_progress)


class RecordingClient:
    def __init__(self) -> None:
        self.progress_updates: list[tuple[float, str]] = []
        self.completions = 0
        self.failures = 0

    async def progress(self, lease, progress: float, message: str) -> None:  # type: ignore[no-untyped-def]
        self.progress_updates.append((progress, message))

    async def complete(self, *args) -> None:  # type: ignore[no-untyped-def]
        self.completions += 1

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
    assert client.completions == 1
    assert client.failures == 0
