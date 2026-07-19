from __future__ import annotations

import platform
import uuid
from pathlib import Path

import httpx

from .config import WorkerSettings
from .models import (
    JobCompletion,
    JobFailure,
    LeaseResponse,
    TranscriptArtifact,
    WorkerLease,
)
from .registry import AdapterRegistry

WORKER_VERSION = "0.1.0"


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
        response = await self._client.post(
            "/api/internal/workers/lease",
            json={
                "protocolVersion": "1.0",
                "workerId": self.worker_id,
                "name": self._settings.worker_name,
                "version": WORKER_VERSION,
                "architecture": platform.machine(),
                "adapters": [
                    adapter.manifest.model_dump(by_alias=True, mode="json")
                    for adapter in self._registry.adapters
                ],
            },
        )
        response.raise_for_status()
        return LeaseResponse.model_validate(response.json())

    async def progress(self, lease: WorkerLease, progress: float, message: str) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/progress",
            json={
                "leaseToken": lease.lease_token,
                "progress": progress,
                "message": message,
            },
        )
        response.raise_for_status()

    async def complete(
        self,
        lease: WorkerLease,
        artifact: TranscriptArtifact,
        adapter_id: str,
        adapter_version: str,
        model_id: str,
    ) -> None:
        completion = JobCompletion(
            artifact=artifact,
            adapter={"id": adapter_id, "version": adapter_version, "modelId": model_id},
        )
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/complete",
            json={
                "leaseToken": lease.lease_token,
                "result": completion.model_dump(by_alias=True, mode="json"),
            },
        )
        response.raise_for_status()

    async def fail(self, lease: WorkerLease, failure: JobFailure) -> None:
        response = await self._client.post(
            f"/api/internal/jobs/{lease.job_id}/fail",
            json={
                "leaseToken": lease.lease_token,
                "error": failure.model_dump(by_alias=True, mode="json"),
            },
        )
        response.raise_for_status()


def _load_or_create_worker_id(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    worker_id = str(uuid.uuid4())
    path.write_text(worker_id, encoding="utf-8")
    return worker_id
