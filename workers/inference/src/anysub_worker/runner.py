from __future__ import annotations

import asyncio
import logging

import httpx

from .adapter import TranscriptionAdapter
from .client import ApplicationClient
from .config import WorkerSettings
from .models import AdapterCapability, JobFailure, TranscriptionRequest
from .registry import AdapterLoadError, AdapterRegistry

LOGGER = logging.getLogger(__name__)


async def run_forever(settings: WorkerSettings, registry: AdapterRegistry) -> None:
    client = ApplicationClient(settings, registry)
    LOGGER.info(
        "worker started id=%s adapters=%s",
        client.worker_id,
        ",".join(adapter.manifest.id for adapter in registry.adapters),
    )
    try:
        while True:
            try:
                response = await client.lease()
                if response.lease is None:
                    await asyncio.sleep(response.poll_after_ms / 1000)
                    continue
                await _execute(client, registry, response.lease)
            except httpx.HTTPError as exc:
                LOGGER.warning("application API unavailable: %s", exc)
                await asyncio.sleep(3)
    finally:
        await client.close()


async def _execute(client: ApplicationClient, registry: AdapterRegistry, lease: object) -> None:
    from .models import WorkerLease

    if not isinstance(lease, WorkerLease):
        raise TypeError("expected a validated worker lease")

    payload = lease.payload
    try:
        adapter = registry.require(
            payload.adapter_id, payload.model_id, AdapterCapability.TRANSCRIBE
        )
        if not isinstance(adapter, TranscriptionAdapter):
            raise AdapterLoadError(
                f"adapter {payload.adapter_id} declares transcription support "
                "but does not implement it"
            )

        async def report(progress: float, message: str) -> None:
            await client.progress(lease, progress, message)

        artifact = await adapter.transcribe(
            TranscriptionRequest(
                jobId=lease.job_id,
                projectId=payload.project_id,
                runId=payload.run_id,
                modelId=payload.model_id,
                mediaPath=payload.media_path,
                language=payload.language,
                options=payload.options,
            ),
            report,
        )
        await client.complete(
            lease,
            artifact,
            adapter.manifest.id,
            adapter.manifest.version,
            payload.model_id,
        )
    except AdapterLoadError as exc:
        await client.fail(
            lease, JobFailure(code="adapter_unavailable", message=str(exc), retryable=False)
        )
    except Exception as exc:
        LOGGER.exception("job failed job_id=%s", lease.job_id)
        await client.fail(
            lease,
            JobFailure(code="adapter_error", message=str(exc), retryable=True),
        )
