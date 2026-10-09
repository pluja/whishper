from pathlib import Path

import httpx
import pytest

from anysub_worker import client as client_module
from anysub_worker.client import (
    FINAL_REPORT_RETRY_DELAYS_SECONDS,
    ApplicationClient,
    LeaseLostError,
)
from anysub_worker.config import WorkerSettings
from anysub_worker.models import (
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaPreparationJobPayload,
    MediaProbeArtifact,
    WorkerLease,
)
from anysub_worker.registry import AdapterRegistry

COMPLETE_URL = "http://app.test/api/internal/jobs/job-media/complete"
LEASE_URL = "http://app.test/api/internal/workers/lease"

LEASE = WorkerLease(
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

COMPLETION = MediaPreparationJobCompletion(
    probe=MediaProbeArtifact(
        durationUs=2_000_000,
        formatNames=("wav",),
        seekable=True,
        frameRateMode="unknown",
        proxyRecommended=False,
        proxyReasons=(),
        streams=(),
    ),
    artifacts=(),
    generator=MediaGenerator(version="7.1.1"),
)


class RecordedSleeps(list[float]):
    async def __call__(self, seconds: float) -> None:
        self.append(seconds)


def make_client(tmp_path: Path, sleeps: RecordedSleeps) -> ApplicationClient:
    settings = WorkerSettings(
        app_url="http://app.test",
        worker_token="test-token",
        data_root=tmp_path,
        model_root=tmp_path / "models",
        worker_id_file=tmp_path / "worker-id",
    )
    return ApplicationClient(settings, AdapterRegistry(()), sleep=sleeps)


async def test_completion_is_retried_on_server_and_network_errors(
    tmp_path: Path, respx_mock
) -> None:  # type: ignore[no-untyped-def]
    sleeps = RecordedSleeps()
    client = make_client(tmp_path, sleeps)
    route = respx_mock.post(COMPLETE_URL).mock(
        side_effect=[
            httpx.Response(503),
            httpx.ConnectError("connection refused"),
            httpx.Response(200, json={"accepted": True}),
        ]
    )

    try:
        await client.complete_media_preparation(LEASE, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 3
    assert sleeps == [1, 2]


async def test_completion_gives_up_after_the_retry_budget(tmp_path: Path, respx_mock) -> None:  # type: ignore[no-untyped-def]
    sleeps = RecordedSleeps()
    client = make_client(tmp_path, sleeps)
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(502))

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.complete_media_preparation(LEASE, COMPLETION)
    finally:
        await client.close()

    assert sleeps == list(FINAL_REPORT_RETRY_DELAYS_SECONDS)
    assert sum(sleeps) == 60
    assert route.call_count == len(FINAL_REPORT_RETRY_DELAYS_SECONDS) + 1


async def test_rejected_completion_is_not_retried(tmp_path: Path, respx_mock) -> None:  # type: ignore[no-untyped-def]
    client = make_client(tmp_path, RecordedSleeps())
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(400))

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.complete_media_preparation(LEASE, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 1


async def test_lease_conflict_raises_lease_lost(tmp_path: Path, respx_mock) -> None:  # type: ignore[no-untyped-def]
    client = make_client(tmp_path, RecordedSleeps())
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(409))

    try:
        with pytest.raises(LeaseLostError):
            await client.complete_media_preparation(LEASE, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 1


async def test_hardware_is_detected_once_and_memory_refreshed_per_poll(
    tmp_path: Path, respx_mock, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    real_detect_hardware = client_module.detect_hardware
    detections: list[None] = []

    def counting_detect_hardware(settings: WorkerSettings):  # type: ignore[no-untyped-def]
        detections.append(None)
        return real_detect_hardware(settings)

    monkeypatch.setattr(client_module, "detect_hardware", counting_detect_hardware)
    client = make_client(tmp_path, RecordedSleeps())
    route = respx_mock.post(LEASE_URL).mock(
        return_value=httpx.Response(200, json={"lease": None, "pollAfterMs": 500})
    )
    memory_reads: list[None] = []
    real_detect_memory = client_module.detect_memory

    def counting_detect_memory():  # type: ignore[no-untyped-def]
        memory_reads.append(None)
        return real_detect_memory()

    monkeypatch.setattr(client_module, "detect_memory", counting_detect_memory)

    try:
        await client.lease()
        await client.lease()
    finally:
        await client.close()

    assert route.call_count == 2
    assert len(detections) == 1
    assert len(memory_reads) == 2
