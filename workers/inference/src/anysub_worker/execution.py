from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal

import httpx

from .adapter import ProgressReporter, TranscriptionAdapter
from .client import ApplicationClient
from .errors import JobError, LeaseLostError, describe_error
from .media import prepare_media
from .models import (
    AdapterCapability,
    JobFailure,
    MediaPreparationJobPayload,
    TranscriptionJobPayload,
    TranscriptionRequest,
    WorkerLease,
)
from .registry import AdapterLoadError, AdapterRegistry

LOGGER = logging.getLogger(__name__)
LEASE_HEARTBEAT_SECONDS = 20
# Compose stops containers after 10s, so the shutdown failure report must finish well before.
SHUTDOWN_REPORT_SECONDS = 5

type JobKind = Literal["transcribe", "media_prepare"]


class _LeasedJob:
    def __init__(self, client: ApplicationClient, lease: WorkerLease) -> None:
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


async def execute_job(
    client: ApplicationClient, registry: AdapterRegistry, lease: WorkerLease
) -> None:
    kind = lease.payload.kind
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
                    code=_failure_code(kind),
                    message="The worker shut down before the job finished.",
                    retryable=True,
                ),
                timeout=SHUTDOWN_REPORT_SECONDS,
            )
        raise
    except Exception as error:
        LOGGER.exception("job failed job_id=%s", lease.job_id)
        await _report_failure(client, lease, _failure_for(error, kind))
    finally:
        heartbeat.cancel()
        await asyncio.wait([heartbeat])


def _shutting_down() -> bool:
    task = asyncio.current_task()
    return task is not None and task.cancelling() > 0


async def _report_failure(
    client: ApplicationClient,
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


def _failure_for(error: Exception, kind: JobKind) -> JobFailure:
    if isinstance(error, JobError):
        return JobFailure(code=error.code, message=str(error), retryable=error.retryable)
    return JobFailure(
        code=_failure_code(kind),
        message=describe_error(error),
        retryable=not _is_rejected_request(error),
    )


def _failure_code(kind: JobKind) -> str:
    return "adapter_error" if kind == "transcribe" else "media_preparation_error"


def _is_rejected_request(error: Exception) -> bool:
    return (
        isinstance(error, httpx.HTTPStatusError)
        and error.response.is_client_error
        and error.response.status_code != httpx.codes.CONFLICT
    )


async def _run(
    client: ApplicationClient,
    registry: AdapterRegistry,
    lease: WorkerLease,
    report: ProgressReporter,
) -> None:
    payload = lease.payload
    if isinstance(payload, TranscriptionJobPayload):
        await _run_transcription(client, registry, lease, payload, report)
    else:
        await _run_media_preparation(client, lease, payload, report)


async def _run_media_preparation(
    client: ApplicationClient,
    lease: WorkerLease,
    payload: MediaPreparationJobPayload,
    report: ProgressReporter,
) -> None:
    await report(0.0, "Starting media preparation")
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


async def _run_transcription(
    client: ApplicationClient,
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
