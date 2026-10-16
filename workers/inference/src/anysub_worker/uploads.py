from __future__ import annotations

import re
from pathlib import Path
from typing import BinaryIO

import httpx

from .errors import LeaseLostError
from .models import MediaDerivativeKind, WorkerLease
from .retry import Sleep, is_transient, retry

ARTIFACT_CHUNK_BYTES = 16 * 1024 * 1024
ARTIFACT_UPLOAD_ATTEMPTS = 3
UPLOAD_OFFSET = re.compile(r"[0-9]{1,15}")


class ArtifactUploadError(RuntimeError):
    pass


async def upload_artifact(
    http: httpx.AsyncClient,
    lease: WorkerLease,
    kind: MediaDerivativeKind,
    artifact_path: Path,
    *,
    sleep: Sleep,
) -> None:
    upload = _StagedUpload(http, lease, kind, artifact_path.stat().st_size)
    with artifact_path.open("rb") as artifact:
        while not upload.complete:
            await retry(
                lambda: upload.send_next_chunk(artifact),
                attempts=ARTIFACT_UPLOAD_ATTEMPTS,
                is_retryable=_is_retryable,
                sleep=sleep,
            )


class _StagedUpload:
    def __init__(
        self,
        http: httpx.AsyncClient,
        lease: WorkerLease,
        kind: MediaDerivativeKind,
        size_bytes: int,
    ) -> None:
        self._http = http
        self._lease = lease
        self._url = f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}"
        self._headers = {"X-Anysub-Lease-Token": lease.lease_token}
        self._size_bytes = size_bytes
        # Unknown until the application confirms it, and again after any failed chunk.
        self._offset: int | None = None

    @property
    def complete(self) -> bool:
        return self._offset == self._size_bytes

    async def send_next_chunk(self, artifact: BinaryIO) -> None:
        if self._offset is None:
            self._offset = await self._staged_offset()
            if self.complete:
                return
        offset = self._offset
        artifact.seek(offset)
        chunk = artifact.read(min(ARTIFACT_CHUNK_BYTES, self._size_bytes - offset))
        try:
            response = await self._http.patch(
                self._url,
                headers={
                    **self._headers,
                    "Upload-Offset": str(offset),
                    "Upload-Length": str(self._size_bytes),
                    "Content-Length": str(len(chunk)),
                    "Content-Type": "application/offset+octet-stream",
                },
                content=chunk,
            )
            # A conflict carrying Upload-Offset only means the staged data moved on.
            if _is_lease_conflict(response):
                raise LeaseLostError(self._lease.job_id)
            response.raise_for_status()
        except httpx.HTTPError:
            self._offset = None
            raise
        next_offset = _upload_offset(response, self._size_bytes)
        if next_offset <= offset or next_offset > offset + len(chunk):
            raise ArtifactUploadError(
                f"application acknowledged artifact offset {next_offset} "
                f"for a chunk at {offset} of {len(chunk)} bytes"
            )
        self._offset = next_offset

    async def _staged_offset(self) -> int:
        response = await self._http.head(self._url, headers=self._headers)
        if response.status_code == httpx.codes.CONFLICT:
            raise LeaseLostError(self._lease.job_id)
        response.raise_for_status()
        return _upload_offset(response, self._size_bytes)


def _is_retryable(error: Exception) -> bool:
    return is_transient(error) or _is_offset_conflict(error)


def _is_lease_conflict(response: httpx.Response) -> bool:
    return response.status_code == httpx.codes.CONFLICT and "upload-offset" not in response.headers


def _is_offset_conflict(error: Exception) -> bool:
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
