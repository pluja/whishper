from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from .adapter import AdapterExecutionError, TranscriptionAdapter
from .client import ApplicationClient
from .config import WorkerSettings
from .media import MediaPreparationError, prepare_media
from .models import AdapterCapability, JobFailure, TranscriptionRequest
from .registry import AdapterLoadError, AdapterRegistry

LOGGER = logging.getLogger(__name__)
LEASE_HEARTBEAT_SECONDS = 20


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
    from .models import TranscriptionJobPayload, WorkerLease

    if not isinstance(lease, WorkerLease):
        raise TypeError("expected a validated worker lease")

    payload = lease.payload
    heartbeat: asyncio.Task[None] | None = None
    current_progress = 0.0
    current_message = (
        "Starting transcription"
        if isinstance(payload, TranscriptionJobPayload)
        else "Starting media preparation"
    )

    async def report(progress: float, message: str) -> None:
        nonlocal current_progress, current_message
        current_progress = progress
        current_message = message
        await client.progress(lease, progress, message)

    try:
        await report(current_progress, current_message)
        heartbeat = asyncio.create_task(
            _keep_lease_alive(
                client,
                lease,
                lambda: (current_progress, current_message),
            )
        )

        if payload.kind == "media_prepare":
            with TemporaryDirectory(prefix="anysub-media-") as temporary:
                root = Path(temporary)
                source_path = root / f"source{Path(payload.source_filename).suffix.lower()}"
                await report(0.02, "Downloading source media")
                await client.download_source(lease, source_path)
                prepared = await prepare_media(
                    source_path,
                    payload.source_filename,
                    root / "artifacts",
                    report,
                )
                artifact_count = len(prepared.artifacts)
                for index, (kind, artifact_path) in enumerate(prepared.artifacts.items()):
                    progress = 0.88 + (0.09 * index / max(1, artifact_count))
                    await report(progress, f"Uploading {kind} derivative")
                    await client.upload_artifact(lease, kind, artifact_path)
                await report(0.98, "Finalizing media metadata")
                await client.complete_media_preparation(lease, prepared.completion)
            return

        adapter = registry.require(
            payload.adapter_id, payload.model_id, AdapterCapability.TRANSCRIBE
        )
        if not isinstance(adapter, TranscriptionAdapter):
            raise AdapterLoadError(
                f"adapter {payload.adapter_id} declares transcription support "
                "but does not implement it"
            )

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
        await client.complete_transcription(
            lease,
            artifact,
            adapter.manifest.id,
            adapter.manifest.version,
            payload.model_id,
        )
    except MediaPreparationError as exc:
        await client.fail(
            lease,
            JobFailure(
                code="media_preparation_error",
                message=str(exc),
                retryable=exc.retryable,
            ),
        )
    except AdapterExecutionError as exc:
        await client.fail(
            lease,
            JobFailure(
                code="adapter_error",
                message=str(exc),
                retryable=exc.retryable,
            ),
        )
    except AdapterLoadError as exc:
        await client.fail(
            lease, JobFailure(code="adapter_unavailable", message=str(exc), retryable=False)
        )
    except Exception as exc:
        LOGGER.exception("job failed job_id=%s", lease.job_id)
        code = "adapter_error" if payload.kind == "transcribe" else "media_preparation_error"
        await client.fail(
            lease,
            JobFailure(code=code, message=str(exc), retryable=True),
        )
    finally:
        if heartbeat is not None:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat


async def _keep_lease_alive(
    client: ApplicationClient,
    lease: object,
    current: Callable[[], tuple[float, str]],
) -> None:
    from .models import WorkerLease

    if not isinstance(lease, WorkerLease):
        raise TypeError("invalid lease heartbeat state")
    while True:
        await asyncio.sleep(LEASE_HEARTBEAT_SECONDS)
        progress, message = current()
        await client.progress(lease, progress, message)
