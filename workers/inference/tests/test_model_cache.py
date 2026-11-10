import httpx
import pytest
from fakes import CachingFakeAdapter, FakeAdapter, RecordingClient

from anysub_worker import execution
from anysub_worker.model_cache import ModelCacheError, run_model_cache_job
from anysub_worker.models import (
    JobCompletion,
    ModelCacheAction,
    ModelCacheJobPayload,
    WorkerLease,
)
from anysub_worker.registry import AdapterLoadError, AdapterRegistry

WORKER_ID = "5f0c3a52-58b8-4c4b-9f0e-0d6c8f3f6d10"


def payload(action: ModelCacheAction, model_id: str = "fake-v1") -> ModelCacheJobPayload:
    return ModelCacheJobPayload(
        kind="model_cache",
        action=action,
        workerId=WORKER_ID,
        adapterId="builtin.fake",
        modelId=model_id,
    )


def model_cache_lease() -> WorkerLease:
    return WorkerLease(
        jobId="job-model",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-11-10T00:00:00Z",
        payload=payload("download"),
    )


async def no_progress(fraction: float, message: str) -> None:
    return None


@pytest.mark.parametrize("action", ["download", "delete"])
async def test_the_job_runs_the_requested_action(action: ModelCacheAction) -> None:
    adapter = CachingFakeAdapter()

    completion = await run_model_cache_job(
        AdapterRegistry((adapter,)), payload(action), no_progress
    )

    assert completion.action == action
    assert (adapter.downloaded, adapter.deleted) == (
        (["fake-v1"], []) if action == "download" else ([], ["fake-v1"])
    )


async def test_an_adapter_without_model_management_fails_permanently() -> None:
    with pytest.raises(ModelCacheError) as raised:
        await run_model_cache_job(
            AdapterRegistry((FakeAdapter(),)), payload("download"), no_progress
        )

    assert raised.value.retryable is False


async def test_an_unknown_model_is_rejected() -> None:
    with pytest.raises(AdapterLoadError, match="no model missing"):
        await run_model_cache_job(
            AdapterRegistry((CachingFakeAdapter(),)), payload("download", "missing"), no_progress
        )


async def test_a_model_cache_lease_reports_its_completion(
    recording_client: RecordingClient,
) -> None:
    adapter = CachingFakeAdapter()

    await execution.execute_job(recording_client, AdapterRegistry((adapter,)), model_cache_lease())

    assert [completion.action for completion in recording_client.model_cache_completions] == [
        "download"
    ]
    assert recording_client.progress_updates[-1] == (0.5, "Downloading")
    assert recording_client.failures == []


class ManifestRecordingClient(RecordingClient):
    def __init__(self, announce_error: Exception | None = None) -> None:
        super().__init__()
        self.announce_error = announce_error
        self.events: list[str] = []

    async def announce(self) -> None:
        self.events.append("announce")
        if self.announce_error is not None:
            raise self.announce_error

    async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None:
        self.events.append("complete")
        await super().complete(lease, completion)


async def test_the_manifest_is_refreshed_before_the_job_reads_as_done() -> None:
    client = ManifestRecordingClient()

    await execution.execute_job(
        client, AdapterRegistry((CachingFakeAdapter(),)), model_cache_lease()
    )

    assert client.events == ["announce", "complete"]


async def test_a_failed_manifest_refresh_still_completes_the_job() -> None:
    client = ManifestRecordingClient(httpx.ConnectError("application restarting"))

    await execution.execute_job(
        client, AdapterRegistry((CachingFakeAdapter(),)), model_cache_lease()
    )

    assert client.events == ["announce", "complete"]
    assert client.failures == []


async def test_a_failed_model_cache_job_reports_the_model_cache_code(
    recording_client: RecordingClient,
) -> None:
    await execution.execute_job(
        recording_client, AdapterRegistry((FakeAdapter(),)), model_cache_lease()
    )

    assert [failure.code for failure in recording_client.failures] == ["model_cache_error"]
