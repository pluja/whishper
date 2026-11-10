from __future__ import annotations

import asyncio
import logging
import re
import shutil
from collections.abc import Coroutine
from pathlib import Path
from tempfile import TemporaryDirectory, gettempdir
from typing import Any, Protocol

import httpx

from .adapter import AdapterExecutionError, ProgressReporter, TranscriptionAdapter
from .errors import LeaseLostError, describe_error, failure_for
from .media.errors import MediaPreparationError
from .media.prepare import prepare_media
from .model_cache import ModelCacheError, run_model_cache_job
from .models import (
    AdapterCapability,
    AdapterReference,
    JobCompletion,
    JobFailure,
    JobFailureCode,
    MediaDerivativeKind,
    MediaPreparationJobPayload,
    ModelCacheJobPayload,
    TranscriptionJobCompletion,
    TranscriptionJobPayload,
    WorkerJobPayload,
    WorkerLease,
)
from .progress import progress_span
from .registry import AdapterLoadError, AdapterRegistry

LOGGER = logging.getLogger(__name__)
# The application drops workers it has not heard from in 45 s.
LEASE_HEARTBEAT_SECONDS = 10
# Compose stops containers after 10s, so the shutdown failure report must finish well before.
SHUTDOWN_REPORT_SECONDS = 5
MEDIA_DOWNLOAD_PROGRESS = 0.02
WORK_DIRECTORY_PREFIX = "anysub-media-"
SAFE_SUFFIX = re.compile(r"\.[a-z0-9]{1,16}")
MEDIA_PREPARATION_SPAN = (0.1, 0.86)
MEDIA_UPLOAD_SPAN = (0.86, 0.98)


class JobClient(Protocol):
    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None: ...

    async def fetch_source(
        self, lease: WorkerLease, storage_key: str, download_to: Path
    ) -> Path: ...

    async def upload_artifact(
        self, lease: WorkerLease, kind: MediaDerivativeKind, artifact_path: Path
    ) -> None: ...

    async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None: ...

    async def fail(self, lease: WorkerLease, failure: JobFailure) -> None: ...


class _LeasedJob:
    def __init__(self, client: JobClient, lease: WorkerLease) -> None:
        self._client = client
        self._lease = lease
        self._progress = 0.0
        self._message = ""
        self._work: asyncio.Task[None] | None = None
        self.lost = False

    def start(self, work: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
        self._work = asyncio.create_task(work)
        return self._work

    async def report(self, progress: float, message: str) -> None:
        self._progress = progress
        self._message = message
        await self._send_progress()

    async def keep_alive(self) -> None:
        while not self.lost:
            await asyncio.sleep(LEASE_HEARTBEAT_SECONDS)
            await self._send_progress()

    async def _send_progress(self) -> None:
        try:
            await self._client.progress(self._lease, self._progress, self._message)
        except LeaseLostError:
            LOGGER.warning("lease lost, abandoning job_id=%s", self._lease.job_id)
            self.lost = True
            if self._work is not None:
                self._work.cancel()
        except Exception as error:
            # Progress is best effort: the next heartbeat tick retries with the latest state.
            LOGGER.warning(
                "progress report failed job_id=%s: %s", self._lease.job_id, describe_error(error)
            )


async def execute_job(client: JobClient, registry: AdapterRegistry, lease: WorkerLease) -> None:
    fallback_code = _fallback_failure_code(lease.payload)
    job = _LeasedJob(client, lease)
    work = job.start(_run(client, registry, lease, job.report))
    heartbeat = asyncio.create_task(job.keep_alive())
    try:
        await work
    except LeaseLostError:
        LOGGER.warning("lease lost before the job finished job_id=%s", lease.job_id)
    except asyncio.CancelledError:
        if not _shutting_down():
            return
        if not job.lost:
            await _report_failure(
                client,
                lease,
                JobFailure(
                    code=fallback_code,
                    message="The worker shut down before the job finished.",
                    retryable=True,
                ),
                timeout=SHUTDOWN_REPORT_SECONDS,
            )
        raise
    except Exception as error:
        LOGGER.exception("job failed job_id=%s", lease.job_id)
        await _report_failure(client, lease, failure_for(error, fallback_code))
    finally:
        heartbeat.cancel()
        await asyncio.wait([heartbeat])


def _shutting_down() -> bool:
    task = asyncio.current_task()
    return task is not None and task.cancelling() > 0


async def _report_failure(
    client: JobClient,
    lease: WorkerLease,
    failure: JobFailure,
    *,
    timeout: float | None = None,
) -> None:
    try:
        async with asyncio.timeout(timeout):
            await client.fail(lease, failure)
    except LeaseLostError:
        LOGGER.warning("lease lost before the failure was reported job_id=%s", lease.job_id)
    except (httpx.HTTPError, TimeoutError) as error:
        LOGGER.error(
            "could not report job failure job_id=%s: %s", lease.job_id, describe_error(error)
        )


def _fallback_failure_code(payload: WorkerJobPayload) -> JobFailureCode:
    if isinstance(payload, TranscriptionJobPayload):
        return AdapterExecutionError.code
    if isinstance(payload, ModelCacheJobPayload):
        return ModelCacheError.code
    return MediaPreparationError.code


async def _run(
    client: JobClient,
    registry: AdapterRegistry,
    lease: WorkerLease,
    report: ProgressReporter,
) -> None:
    payload = lease.payload
    if isinstance(payload, TranscriptionJobPayload):
        await _run_transcription(client, registry, lease, payload, report)
    elif isinstance(payload, ModelCacheJobPayload):
        await client.complete(lease, await run_model_cache_job(registry, payload, report))
    else:
        await _run_media_preparation(client, lease, payload, report)


async def _run_media_preparation(
    client: JobClient,
    lease: WorkerLease,
    payload: MediaPreparationJobPayload,
    report: ProgressReporter,
) -> None:
    await report(0.0, "Starting media preparation")
    with TemporaryDirectory(prefix=WORK_DIRECTORY_PREFIX) as temporary:
        root = Path(temporary)
        await report(MEDIA_DOWNLOAD_PROGRESS, "Fetching source media")
        source_path = await client.fetch_source(
            lease,
            payload.source_storage_key,
            root / f"source{_safe_suffix(payload.source_filename)}",
        )
        prepared = await prepare_media(
            source_path,
            payload.source_filename,
            root / "artifacts",
            progress_span(report, *MEDIA_PREPARATION_SPAN),
        )
        report_upload = progress_span(report, *MEDIA_UPLOAD_SPAN)
        for index, derivative in enumerate(prepared.derivatives):
            kind = derivative.upload.kind
            await report_upload(index / len(prepared.derivatives), f"Uploading {kind} derivative")
            await client.upload_artifact(lease, kind, derivative.path)
        await report(MEDIA_UPLOAD_SPAN[1], "Finalizing media metadata")
        await client.complete(lease, prepared.completion)


async def _run_transcription(
    client: JobClient,
    registry: AdapterRegistry,
    lease: WorkerLease,
    payload: TranscriptionJobPayload,
    report: ProgressReporter,
) -> None:
    await report(0.0, "Starting transcription")
    adapter = registry.require(payload.adapter_id, payload.model_id, AdapterCapability.TRANSCRIBE)
    if not isinstance(adapter, TranscriptionAdapter):
        raise AdapterLoadError(
            f"adapter {payload.adapter_id} declares transcription support but does not implement it"
        )

    artifact = await adapter.transcribe(payload.to_request(lease.job_id), report)
    manifest = adapter.manifest
    await client.complete(
        lease,
        TranscriptionJobCompletion(
            artifact=artifact,
            adapter=AdapterReference(
                id=manifest.id, version=manifest.version, modelId=payload.model_id
            ),
        ),
    )


def _safe_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if SAFE_SUFFIX.fullmatch(suffix) else ""


def remove_stale_work_directories(temporary_root: Path | None = None) -> None:
    root = temporary_root or Path(gettempdir())
    for leftover in root.glob(f"{WORK_DIRECTORY_PREFIX}*"):
        shutil.rmtree(leftover, ignore_errors=True)
        LOGGER.info("removed leftover media work directory %s", leftover.name)
