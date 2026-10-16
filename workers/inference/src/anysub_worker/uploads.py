from __future__ import annotations

import re
from pathlib import Path

import httpx

from .errors import LeaseLostError, is_transient
from .models import WorkerLease
from .timing import Sleep

ARTIFACT_CHUNK_BYTES = 16 * 1024 * 1024
ARTIFACT_UPLOAD_ATTEMPTS = 3
UPLOAD_OFFSET = re.compile(r"[0-9]{1,15}")


class ArtifactUploadError(RuntimeError):
    pass


async def upload_artifact(
    http: httpx.AsyncClient,
    lease: WorkerLease,
    kind: str,
    artifact_path: Path,
    *,
    sleep: Sleep,
) -> None:
    size_bytes = artifact_path.stat().st_size
    url = f"/api/internal/jobs/{lease.job_id}/artifacts/{kind}"
    headers = {"X-Anysub-Lease-Token": lease.lease_token}
    offset = await _staged_artifact_offset(http, lease, url, headers, size_bytes)

    failures = 0
    with artifact_path.open("rb") as artifact:
        while offset < size_bytes:
            artifact.seek(offset)
            chunk = artifact.read(min(ARTIFACT_CHUNK_BYTES, size_bytes - offset))
            try:
                response = await http.patch(
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
                if not (is_transient(error) or _is_offset_conflict(error)):
                    raise
                failures += 1
                if failures >= ARTIFACT_UPLOAD_ATTEMPTS:
                    raise
                await sleep(failures)
                offset = await _staged_artifact_offset(http, lease, url, headers, size_bytes)
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
    http: httpx.AsyncClient,
    lease: WorkerLease,
    url: str,
    headers: dict[str, str],
    size_bytes: int,
) -> int:
    response = await http.head(url, headers=headers)
    if response.status_code == httpx.codes.CONFLICT:
        raise LeaseLostError(lease.job_id)
    response.raise_for_status()
    return _upload_offset(response, size_bytes)


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
