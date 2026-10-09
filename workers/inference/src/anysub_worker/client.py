from __future__ import annotations

import asyncio
import logging
import platform
import re
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

import httpx

from .config import WorkerSettings
from .hardware import detect_hardware, detect_memory
from .models import (
    MEDIA_PREPARATION_VERSION,
    JobCompletionReport,
    JobFailure,
    JobFailureReport,
    JobProgressReport,
    LeaseResponse,
    MediaPreparationJobCompletion,
    StrictModel,
    TranscriptArtifact,
    TranscriptionJobCompletion,
    WorkerCapabilities,
    WorkerLease,
    WorkerManifest,
)
from .registry import AdapterRegistry

LOGGER = logging.getLogger(__name__)
WORKER_VERSION = "0.1.0"
ARTIFACT_CHUNK_BYTES = 16 * 1024 * 1024
FINAL_REPORT_RETRY_DELAYS_SECONDS = (1, 2, 4, 8, 15, 30)
ARTIFACT_UPLOAD_ATTEMPTS = 3
UPLOAD_OFFSET = re.compile(r"[0-9]{1,15}")

Sleep = Callable[[float], Awaitable[None]]


class LeaseLostError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(f"lease for job {job_id} is no longer active")


class ArtifactUploadError(RuntimeError):
    pass


def _is_transient(error: httpx.HTTPError) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.is_server_error
    return isinstance(error, httpx.TransportError)


def _is_lease_conflict(response: httpx.Response) -> bool:
    return response.status_code == httpx.codes.CONFLICT and "upload-offset" not in response.headers


def _is_offset_conflict(error: httpx.HTTPError) -> bool:
    return (
        isinstance(error, httpx.HTTPStatusError)
        and error.response.status_code == httpx.codes.CONFLICT
    )


def _upload_offset(response: httpx.Response, size_bytes: int) -> int:
    header = response.headers.get("upload-offset")
    if header is None or not UPLOAD_OFFSET.fullmatch(header):
        raise ArtifactUploadError(
            f"application sent a missing or malformed Upload-Offset header: {header!r}"
        )
    offset = int(header)
    if offset > size_bytes:
        raise ArtifactUploadError(
            f"application reported artifact offset {offset} beyond its {size_bytes} bytes"
        )
    return offset


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
        self._hardware = detect_hardware(settings)
        self.worker_id = _load_or_create_worker_id(settings.worker_id_file)
        self._client = httpx.AsyncClient(
            base_url=str(settings.app_url).rstrip("/"),
            headers={"Authorization": f"Bearer {settings.worker_token}"},
            timeout=settings.request_timeout_seconds,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def lease(self) -> LeaseResponse:
        manifest = WorkerManifest(
            workerId=self.worker_id,
            name=self._settings.worker_name,
            version=WORKER_VERSION,
            architecture=platform.machine(),
            capabilities=WorkerCapabilities(mediaPreparation=MEDIA_PREPARATION_VERSION),
            adapters=tuple(adapter.manifest for adapter in self._registry.adapters),
            hardware=self._hardware.model_copy(update={"memory": detect_memory()}),
        )
        response = await self._client.post("/api/internal/workers/lease", json=_wire(manifest))
        response.raise_for_status()
        return LeaseResponse.model_validate(response.json())

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        await self._post_job_report(
            lease,
            "progress",
            JobProgressReport(leaseToken=lease.lease_token, progress=progress, message=message),
        )

    async def download_source(self, lease: WorkerLease, destination: Path) -> None:
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

    async def upload_artifact(self, lease: WorkerLease, kind: str, artifact_path: Path) -> None:
        size_bytes = artifact_path.stat().st_size
        url = f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}"
        headers = {"X-Anysub-Lease-Token": lease.lease_token}
        offset = await self._staged_artifact_offset(lease, url, headers, size_bytes)

        failures = 0
        with artifact_path.open("rb") as artifact:
            while offset < size_bytes:
                artifact.seek(offset)
                chunk = artifact.read(min(ARTIFACT_CHUNK_BYTES, size_bytes - offset))
                try:
                    response = await self._client.patch(
                        url,
                        headers={
                            **headers,
                            "Upload-Offset": str(offset),
                            "Upload-Length": str(size_bytes),
                            "Content-Length": str(len(chunk)),
                            "Content-Type": "application/offset+octet-stream",
                        },
                        content=chunk,
                    )
                    # A conflict carrying Upload-Offset only means the staged data moved on.
                    if _is_lease_conflict(response):
                        raise LeaseLostError(lease.job_id)
                    response.raise_for_status()
                except httpx.HTTPError as error:
                    if not (_is_transient(error) or _is_offset_conflict(error)):
                        raise
                    failures += 1
                    if failures >= ARTIFACT_UPLOAD_ATTEMPTS:
                        raise
                    await self._sleep(failures)
                    offset = await self._staged_artifact_offset(lease, url, headers, size_bytes)
                    continue
                next_offset = _upload_offset(response, size_bytes)
                if next_offset <= offset or next_offset > offset + len(chunk):
                    raise ArtifactUploadError(
                        f"application acknowledged artifact offset {next_offset} "
                        f"for a chunk at {offset} of {len(chunk)} bytes"
                    )
                offset = next_offset
                failures = 0

    async def _staged_artifact_offset(
        self, lease: WorkerLease, url: str, headers: dict[str, str], size_bytes: int
    ) -> int:
        response = await self._client.head(url, headers=headers)
        if response.status_code == httpx.codes.CONFLICT:
            raise LeaseLostError(lease.job_id)
        response.raise_for_status()
        return _upload_offset(response, size_bytes)

    async def complete_transcription(
        self,
        lease: WorkerLease,
        artifact: TranscriptArtifact,
        adapter_id: str,
        adapter_version: str,
        model_id: str,
    ) -> None:
        completion = TranscriptionJobCompletion(
            artifact=artifact,
            adapter={"id": adapter_id, "version": adapter_version, "modelId": model_id},
        )
        await self._complete(lease, completion)

    async def complete_media_preparation(
        self, lease: WorkerLease, completion: MediaPreparationJobCompletion
    ) -> None:
        await self._complete(lease, completion)

    async def _complete(
        self,
        lease: WorkerLease,
        completion: TranscriptionJobCompletion | MediaPreparationJobCompletion,
    ) -> None:
        await self._post_final_report(
            lease,
            "complete",
            JobCompletionReport(leaseToken=lease.lease_token, result=completion),
        )

    async def fail(self, lease: WorkerLease, failure: JobFailure) -> None:
        await self._post_final_report(
            lease,
            "fail",
            JobFailureReport(leaseToken=lease.lease_token, error=failure),
        )

    async def _post_final_report(
        self, lease: WorkerLease, action: str, report: StrictModel
    ) -> None:
        for delay in FINAL_REPORT_RETRY_DELAYS_SECONDS:
            try:
                await self._post_job_report(lease, action, report)
                return
            except httpx.HTTPError as error:
                if not _is_transient(error):
                    raise
                LOGGER.warning(
                    "job %s report failed job_id=%s, retrying in %ss: %s",
                    action,
                    lease.job_id,
                    delay,
                    error,
                )
            await self._sleep(delay)
        await self._post_job_report(lease, action, report)

    async def _post_job_report(self, lease: WorkerLease, action: str, report: StrictModel) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/{action}", json=_wire(report)
        )
        if response.status_code == httpx.codes.CONFLICT:
            raise LeaseLostError(lease.job_id)
        response.raise_for_status()


def _wire(message: StrictModel) -> dict[str, object]:
    return message.model_dump(by_alias=True, mode="json")


def _load_or_create_worker_id(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    worker_id = str(uuid.uuid4())
    path.write_text(worker_id, encoding="utf-8")
    return worker_id
