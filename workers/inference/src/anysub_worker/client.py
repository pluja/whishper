from __future__ import annotations

import asyncio
import platform
import uuid
from pathlib import Path

import httpx

from .config import WorkerSettings
from .hardware import detect_hardware
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

WORKER_VERSION = "0.1.0"
ARTIFACT_CHUNK_BYTES = 16 * 1024 * 1024


class ApplicationClient:
    def __init__(self, settings: WorkerSettings, registry: AdapterRegistry) -> None:
        self._settings = settings
        self._registry = registry
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
            hardware=detect_hardware(self._settings),
        )
        response = await self._client.post("/api/internal/workers/lease", json=_wire(manifest))
        response.raise_for_status()
        return LeaseResponse.model_validate(response.json())

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/progress",
            json=_wire(
                JobProgressReport(leaseToken=lease.lease_token, progress=progress, message=message)
            ),
        )
        response.raise_for_status()

    async def download_source(self, lease: WorkerLease, destination: Path) -> None:
        async with self._client.stream(
            "GET",
            f"/api/internal/jobs/{lease.job_id}/source",
            headers={"X-Anysub-Lease-Token": lease.lease_token},
        ) as response:
            response.raise_for_status()
            with destination.open("wb") as output:
                async for chunk in response.aiter_bytes(1024 * 1024):
                    output.write(chunk)

    async def upload_artifact(self, lease: WorkerLease, kind: str, artifact_path: Path) -> None:
        size_bytes = artifact_path.stat().st_size
        headers = {"X-Anysub-Lease-Token": lease.lease_token}
        response = await self._client.head(
            f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}",
            headers=headers,
        )
        response.raise_for_status()
        offset = int(response.headers.get("upload-offset", "0"))
        if offset < 0 or offset > size_bytes:
            raise RuntimeError("application returned an invalid artifact offset")

        failures = 0
        with artifact_path.open("rb") as artifact:
            while offset < size_bytes:
                artifact.seek(offset)
                chunk = artifact.read(min(ARTIFACT_CHUNK_BYTES, size_bytes - offset))
                try:
                    response = await self._client.patch(
                        f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}",
                        headers={
                            **headers,
                            "Upload-Offset": str(offset),
                            "Upload-Length": str(size_bytes),
                            "Content-Length": str(len(chunk)),
                            "Content-Type": "application/offset+octet-stream",
                        },
                        content=chunk,
                    )
                    response.raise_for_status()
                    next_offset = int(response.headers["upload-offset"])
                    if next_offset <= offset or next_offset > offset + len(chunk):
                        raise RuntimeError("application returned an invalid artifact offset")
                    offset = next_offset
                    failures = 0
                except httpx.HTTPError as cause:
                    failures += 1
                    if failures >= 3:
                        detail = (
                            cause.response.text.strip()
                            if isinstance(cause, httpx.HTTPStatusError)
                            else ""
                        )
                        message = "application rejected the artifact upload"
                        if detail:
                            message = f"{message}: {detail}"
                        raise RuntimeError(message) from cause
                    await asyncio.sleep(failures)
                    response = await self._client.head(
                        f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}",
                        headers=headers,
                    )
                    response.raise_for_status()
                    offset = int(response.headers.get("upload-offset", "0"))
                    if offset < 0 or offset > size_bytes:
                        raise RuntimeError(
                            "application returned an invalid artifact offset"
                        ) from None

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
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/complete",
            json=_wire(JobCompletionReport(leaseToken=lease.lease_token, result=completion)),
        )
        response.raise_for_status()

    async def fail(self, lease: WorkerLease, failure: JobFailure) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/fail",
            json=_wire(JobFailureReport(leaseToken=lease.lease_token, error=failure)),
        )
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
