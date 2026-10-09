from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import signal
from collections.abc import Callable, Coroutine
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal

import httpx
from pydantic import ValidationError

from .adapter import AdapterExecutionError, ProgressReporter, TranscriptionAdapter
from .client import ApplicationClient, LeaseLostError, Sleep
from .config import WorkerSettings
from .media import MediaPreparationError, prepare_media
from .models import (
    AdapterCapability,
    JobFailure,
    TranscriptionJobPayload,
    TranscriptionRequest,
    WorkerLease,
)
from .registry import AdapterLoadError, AdapterRegistry
from .threads import wait_for_abandoned_threads

LOGGER = logging.getLogger(__name__)
LEASE_HEARTBEAT_SECONDS = 20
POLL_BACKOFF_BASE_SECONDS = 1
POLL_BACKOFF_CAP_SECONDS = 30
# Compose stops containers after 10s, so the shutdown failure report must finish well before.
SHUTDOWN_REPORT_SECONDS = 5
MAX_RESPONSE_DETAIL_CHARS = 200
HTML_TAG = re.compile(r"<[^>]*>")
SHUTDOWN_SIGNALS = (signal.SIGTERM, signal.SIGINT)
LEASE_POLL_ERRORS = (httpx.HTTPError, ValidationError, json.JSONDecodeError)

type JobKind = Literal["transcribe", "media_prepare"]


async def run_forever(settings: WorkerSettings, registry: AdapterRegistry) -> None:
    client = ApplicationClient(settings, registry)
    LOGGER.info(
        "worker started id=%s adapters=%s",
        client.worker_id,
        ",".join(adapter.manifest.id for adapter in registry.adapters),
    )
    worker = asyncio.current_task()
    stop_requested = False

    def request_stop() -> None:
        nonlocal stop_requested
        if stop_requested or worker is None:
            return
        stop_requested = True
        LOGGER.info("shutdown requested")
        worker.cancel()

    loop = asyncio.get_running_loop()
    for signum in SHUTDOWN_SIGNALS:
        loop.add_signal_handler(signum, request_stop)
    try:
        await poll_forever(client, registry)
    except asyncio.CancelledError:
        if not stop_requested or worker is None:
            raise
        worker.uncancel()
        LOGGER.info("worker stopped")
    finally:
        for signum in SHUTDOWN_SIGNALS:
            loop.remove_signal_handler(signum)
        await client.close()


async def poll_forever(
    client: ApplicationClient,
    registry: AdapterRegistry,
    *,
    sleep: Sleep = asyncio.sleep,
    jitter: Callable[[], float] = random.random,
) -> None:
    consecutive_failures = 0
    while True:
        await wait_for_abandoned_threads()
        try:
            response = await client.lease()
        except LEASE_POLL_ERRORS as error:
            consecutive_failures += 1
            delay = poll_backoff_seconds(consecutive_failures, jitter())
            LOGGER.warning(
                "lease request failed, retrying in %.1fs: %s", delay, describe_error(error)
            )
            await sleep(delay)
            continue
        if response.lease is None:
            consecutive_failures = 0
            await sleep(response.poll_after_ms / 1000)
            continue
        try:
            await _execute(client, registry, response.lease)
        except Exception:
            LOGGER.exception("job execution crashed job_id=%s", response.lease.job_id)
            consecutive_failures += 1
            await sleep(poll_backoff_seconds(consecutive_failures, jitter()))
        else:
            consecutive_failures = 0


def poll_backoff_seconds(consecutive_failures: int, jitter: float) -> float:
    exponent = min(consecutive_failures - 1, 5)
    ceiling = min(POLL_BACKOFF_CAP_SECONDS, POLL_BACKOFF_BASE_SECONDS * 2**exponent)
    return ceiling * (0.5 + jitter / 2)


def describe_error(error: BaseException) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        response = error.response
        message = f"{type(error).__name__}: {response.status_code} {response.reason_phrase}"
        with suppress(httpx.ResponseNotRead):
            detail = _summarize_response_body(response)
            if detail:
                message = f"{message}: {detail}"
        return message
    return f"{type(error).__name__}: {error}" if str(error) else type(error).__name__


def _summarize_response_body(response: httpx.Response) -> str:
    text = response.text
    with suppress(ValueError, RecursionError):
        body = json.loads(text)
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            text = body["message"]
    for line in HTML_TAG.sub(" ", text).splitlines():
        collapsed = " ".join(line.split())
        if collapsed:
            return collapsed[:MAX_RESPONSE_DETAIL_CHARS]
    return ""


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


async def _execute(
    client: ApplicationClient, registry: AdapterRegistry, lease: WorkerLease
) -> None:
    kind = lease.payload.kind
    job = _LeasedJob(client, lease)
    work = job.start(_perform(client, registry, lease, job.report))
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
    if isinstance(error, MediaPreparationError):
        return JobFailure(
            code="media_preparation_error", message=str(error), retryable=error.retryable
        )
    if isinstance(error, AdapterExecutionError):
        return JobFailure(code="adapter_error", message=str(error), retryable=error.retryable)
    if isinstance(error, AdapterLoadError):
        return JobFailure(code="adapter_unavailable", message=str(error), retryable=False)
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


async def _perform(
    client: ApplicationClient,
    registry: AdapterRegistry,
    lease: WorkerLease,
    report: ProgressReporter,
) -> None:
    payload = lease.payload
    if not isinstance(payload, TranscriptionJobPayload):
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
        return

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
