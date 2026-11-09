import json

import httpx
import pytest
import respx
from fakes import RecordedSleeps

from anysub_worker import client as client_module
from anysub_worker.client import FINAL_REPORT_ATTEMPTS, ApplicationClient
from anysub_worker.config import AdapterRuntimeSettings, WorkerSettings
from anysub_worker.errors import LeaseLostError
from anysub_worker.models import (
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaProbeArtifact,
    WorkerHardware,
    WorkerLease,
    WorkerMemory,
)
from anysub_worker.registry import AdapterRegistry

COMPLETE_URL = "http://app.test/api/internal/jobs/job-media/complete"
LEASE_URL = "http://app.test/api/internal/workers/lease"
PRESENCE_URL = "http://app.test/api/internal/workers/presence"

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


def make_client(settings: WorkerSettings, sleeps: RecordedSleeps) -> ApplicationClient:
    return ApplicationClient(settings, AdapterRegistry(()), sleep=sleeps)


async def test_completion_is_retried_on_server_and_network_errors(
    settings: WorkerSettings,
    media_lease: WorkerLease,
    respx_mock: respx.MockRouter,
    caplog: pytest.LogCaptureFixture,
) -> None:
    sleeps = RecordedSleeps()
    client = make_client(settings, sleeps)
    route = respx_mock.post(COMPLETE_URL).mock(
        side_effect=[
            httpx.Response(503),
            httpx.ConnectError("connection refused"),
            httpx.Response(200, json={"accepted": True}),
        ]
    )

    try:
        await client.complete(media_lease, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 3
    assert sleeps == [1, 2]
    assert "HTTPStatusError: 503 Service Unavailable" in caplog.text
    assert "app.test" not in caplog.text


async def test_completion_gives_up_after_the_retry_budget(
    settings: WorkerSettings, media_lease: WorkerLease, respx_mock: respx.MockRouter
) -> None:
    sleeps = RecordedSleeps()
    client = make_client(settings, sleeps)
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(502))

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.complete(media_lease, COMPLETION)
    finally:
        await client.close()

    assert sleeps == [1, 2, 4, 8, 16, 30]
    assert route.call_count == FINAL_REPORT_ATTEMPTS


async def test_rejected_completion_is_not_retried(
    settings: WorkerSettings, media_lease: WorkerLease, respx_mock: respx.MockRouter
) -> None:
    client = make_client(settings, RecordedSleeps())
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(400))

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.complete(media_lease, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 1


async def test_lease_conflict_raises_lease_lost(
    settings: WorkerSettings, media_lease: WorkerLease, respx_mock: respx.MockRouter
) -> None:
    client = make_client(settings, RecordedSleeps())
    route = respx_mock.post(COMPLETE_URL).mock(return_value=httpx.Response(409))

    try:
        with pytest.raises(LeaseLostError):
            await client.complete(media_lease, COMPLETION)
    finally:
        await client.close()

    assert route.call_count == 1


async def test_hardware_is_detected_once_and_memory_refreshed_per_poll(
    settings: WorkerSettings, respx_mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_detect_hardware = client_module.detect_hardware
    detections: list[None] = []

    def counting_detect_hardware(runtime: AdapterRuntimeSettings) -> WorkerHardware:
        detections.append(None)
        return real_detect_hardware(runtime)

    monkeypatch.setattr(client_module, "detect_hardware", counting_detect_hardware)
    client = make_client(settings, RecordedSleeps())
    route = respx_mock.post(LEASE_URL).mock(
        return_value=httpx.Response(200, json={"lease": None, "pollAfterMs": 500})
    )
    memory_reads: list[None] = []
    real_detect_memory = client_module.detect_memory

    def counting_detect_memory() -> WorkerMemory:
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


async def test_announce_posts_the_same_manifest_as_a_lease_request(
    settings: WorkerSettings, respx_mock: respx.MockRouter
) -> None:
    client = make_client(settings, RecordedSleeps())
    lease_route = respx_mock.post(LEASE_URL).mock(
        return_value=httpx.Response(200, json={"lease": None, "pollAfterMs": 500})
    )
    presence_route = respx_mock.post(PRESENCE_URL).mock(return_value=httpx.Response(204))

    try:
        await client.lease()
        await client.announce()
    finally:
        await client.close()

    leased = json.loads(lease_route.calls.last.request.content)
    announced = json.loads(presence_route.calls.last.request.content)
    assert announced["workerId"] == leased["workerId"] == client.worker_id
    assert announced["adapters"] == leased["adapters"]


async def test_announce_raises_when_the_application_rejects_it(
    settings: WorkerSettings, respx_mock: respx.MockRouter
) -> None:
    client = make_client(settings, RecordedSleeps())
    respx_mock.post(PRESENCE_URL).mock(return_value=httpx.Response(401))

    try:
        with pytest.raises(httpx.HTTPStatusError):
            await client.announce()
    finally:
        await client.close()
