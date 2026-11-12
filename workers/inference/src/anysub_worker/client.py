from __future__ import annotations

import asyncio
import logging
import platform
import uuid
from importlib.metadata import version
from pathlib import Path
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from .config import WorkerSettings
from .errors import LeaseLostError, UnreadableJobError, describe_error
from .hardware import describe_hardware, detect_hardware, detect_memory, detect_storage
from .models import (
    MEDIA_PREPARATION_VERSION,
    MODEL_CACHE_VERSION,
    REMOTE_TRANSCRIPTION_VERSION,
    JobCompletion,
    JobCompletionReport,
    JobFailure,
    JobFailureReport,
    JobLease,
    JobProgressReport,
    LeaseResponse,
    MediaDerivativeKind,
    StrictModel,
    UuidString,
    WorkerCapabilities,
    WorkerLease,
    WorkerManifest,
)
from .registry import AdapterRegistry
from .retry import APPLICATION_RETRY_ATTEMPTS, Sleep, is_transient, retry
from .token import WorkerTokenAuth
from .uploads import upload_artifact

LOGGER = logging.getLogger(__name__)
WORKER_VERSION = version("anysub-worker")
WORKER_ID = TypeAdapter(UuidString)


class ApplicationClient:
    def __init__(
        self,
        settings: WorkerSettings,
        registry: AdapterRegistry,
        *,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._settings = settings
        self._registry = registry
        self._sleep = sleep
        self._hardware = detect_hardware(settings.runtime)
        self.worker_id = _load_or_create_worker_id(settings.worker_id_file)
        self._client = httpx.AsyncClient(
            base_url=str(settings.app_url).rstrip("/"),
            auth=WorkerTokenAuth(settings.worker_token, settings.worker_token_file),
            timeout=settings.request_timeout_seconds,
        )

    @property
    def hardware_summary(self) -> str:
        return describe_hardware(self._hardware)

    async def close(self) -> None:
        await self._client.aclose()

    async def lease(self) -> LeaseResponse:
        response = await self._client.post(
            "/api/internal/workers/lease", json=_wire(self._manifest())
        )
        response.raise_for_status()
        return _parse_lease_response(response.json())

    async def announce(self) -> None:
        response = await self._client.post(
            "/api/internal/workers/presence", json=_wire(self._manifest())
        )
        response.raise_for_status()

    def _manifest(self) -> WorkerManifest:
        return WorkerManifest(
            workerId=self.worker_id,
            name=self._settings.worker_name,
            version=WORKER_VERSION,
            architecture=platform.machine(),
            capabilities=WorkerCapabilities(
                mediaPreparation=MEDIA_PREPARATION_VERSION,
                modelCache=MODEL_CACHE_VERSION,
                remoteTranscription=REMOTE_TRANSCRIPTION_VERSION,
            ),
            adapters=tuple(adapter.manifest for adapter in self._registry.adapters),
            hardware=self._hardware.model_copy(update={"memory": detect_memory()}),
            modelStorage=detect_storage(self._settings.runtime.model_root),
        )

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        await self._post_job_report(
            lease,
            "progress",
            JobProgressReport(leaseToken=lease.lease_token, progress=progress, message=message),
        )

    async def fetch_source(self, lease: WorkerLease, storage_key: str, download_to: Path) -> Path:
        shared = _shared_data_file(self._settings.runtime.data_root, storage_key)
        if shared is not None:
            return shared
        await self._download_source(lease, download_to)
        return download_to

    async def _download_source(self, lease: WorkerLease, destination: Path) -> None:
        async with self._client.stream(
            "GET",
            f"/api/internal/jobs/{lease.job_id}/source",
            headers={"X-Anysub-Lease-Token": lease.lease_token},
        ) as response:
            if response.is_error:
                await response.aread()
            response.raise_for_status()
            with destination.open("wb") as output:
                async for chunk in response.aiter_bytes(1024 * 1024):
                    output.write(chunk)

    async def upload_artifact(
        self, lease: WorkerLease, kind: MediaDerivativeKind, artifact_path: Path
    ) -> None:
        await upload_artifact(self._client, lease, kind, artifact_path, sleep=self._sleep)

    async def complete(self, lease: WorkerLease, completion: JobCompletion) -> None:
        await self._post_final_report(
            lease,
            "complete",
            JobCompletionReport(leaseToken=lease.lease_token, result=completion),
        )

    async def fail(self, lease: JobLease, failure: JobFailure) -> None:
        await self._post_final_report(
            lease,
            "fail",
            JobFailureReport(leaseToken=lease.lease_token, error=failure),
        )

    async def _post_final_report(self, lease: JobLease, action: str, report: StrictModel) -> None:
        def log_retry(error: Exception, delay: float) -> None:
            LOGGER.warning(
                "job %s report failed job_id=%s, retrying in %.1fs: %s",
                action,
                lease.job_id,
                delay,
                describe_error(error),
            )

        await retry(
            lambda: self._post_job_report(lease, action, report),
            attempts=APPLICATION_RETRY_ATTEMPTS,
            is_retryable=is_transient,
            sleep=self._sleep,
            on_retry=log_retry,
        )

    async def _post_job_report(self, lease: JobLease, action: str, report: StrictModel) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/{action}", json=_wire(report)
        )
        if response.status_code == httpx.codes.CONFLICT:
            raise LeaseLostError(lease.job_id)
        response.raise_for_status()


def _wire(message: StrictModel) -> dict[str, object]:
    return message.model_dump(by_alias=True, mode="json")


def _parse_lease_response(body: Any) -> LeaseResponse:
    try:
        return LeaseResponse.model_validate(body)
    except ValidationError as error:
        # A lease this worker cannot run still names its job, so the job fails for
        # good instead of waiting out its lease and being handed out again.
        if any(detail["loc"][:1] != ("lease",) for detail in error.errors()):
            raise
        raise UnreadableJobError(JobLease.model_validate(body.get("lease"))) from error


def _load_or_create_worker_id(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        return WORKER_ID.validate_python(path.read_text(encoding="utf-8").strip())
    except FileNotFoundError:
        pass
    except ValidationError:
        LOGGER.warning("%s holds no valid worker ID, replacing it", path)
    worker_id = str(uuid.uuid4())
    # Renamed into place, so a crash never leaves an empty or partial ID behind.
    staged = path.with_name(f"{path.name}.{worker_id}")
    try:
        staged.write_text(worker_id, encoding="utf-8")
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
    return worker_id


# The worker mounts the application's data volume read-only. Reading the source
# from it avoids copying hours of media into the container; a worker without
# the mount downloads instead.
def _shared_data_file(data_root: Path, storage_key: str) -> Path | None:
    root = data_root.resolve()
    path = (root / storage_key).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        return None
    return path
