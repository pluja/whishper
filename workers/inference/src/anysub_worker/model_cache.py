from __future__ import annotations

from .adapter import ModelCacheAdapter, ProgressReporter
from .errors import JobError
from .models import ModelCacheJobCompletion, ModelCacheJobPayload
from .registry import AdapterRegistry


class ModelCacheError(JobError):
    code = "model_cache_error"


async def run_model_cache_job(
    registry: AdapterRegistry, payload: ModelCacheJobPayload, report: ProgressReporter
) -> ModelCacheJobCompletion:
    adapter = registry.require_model(payload.adapter_id, payload.model_id)
    if not isinstance(adapter, ModelCacheAdapter):
        raise ModelCacheError(
            f"The {payload.adapter_id} adapter cannot download or remove its models.",
            retryable=False,
        )
    if payload.action == "download":
        await adapter.download_model(payload.model_id, report)
    else:
        await report(0.0, f"Removing {payload.model_id}")
        await adapter.delete_model(payload.model_id)
    return ModelCacheJobCompletion(action=payload.action)
