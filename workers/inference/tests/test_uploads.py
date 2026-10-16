from collections.abc import Awaitable, Callable
from pathlib import Path

import httpx
import pytest
from fakes import RecordedSleeps

from anysub_worker.errors import LeaseLostError
from anysub_worker.models import WorkerLease
from anysub_worker.uploads import ARTIFACT_UPLOAD_ATTEMPTS, ArtifactUploadError, upload_artifact

ARTIFACT_URL = "http://app.test/api/internal/jobs/job-media/artifacts/waveform"

type Upload = Callable[..., Awaitable[None]]


@pytest.fixture
def upload(tmp_path: Path, media_lease: WorkerLease) -> Upload:
    artifact = tmp_path / "waveform.json"
    artifact.write_bytes(b"waveform")

    async def run(sleeps: RecordedSleeps | None = None) -> None:
        async with httpx.AsyncClient(base_url="http://app.test") as http:
            await upload_artifact(
                http,
                media_lease,
                "waveform",
                artifact,
                sleep=RecordedSleeps() if sleeps is None else sleeps,
            )

    return run


def staged_offset(offset: int) -> httpx.Response:
    return httpx.Response(200, headers={"Upload-Offset": str(offset)})


async def test_artifact_upload_declares_binary_content_type(upload, respx_mock) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(return_value=staged_offset(0))
    patch = respx_mock.patch(ARTIFACT_URL).mock(
        return_value=httpx.Response(204, headers={"Upload-Offset": "8"})
    )

    await upload()

    request = patch.calls.last.request
    assert request.headers["content-type"] == "application/offset+octet-stream"
    assert request.content == b"waveform"


async def test_artifact_upload_retries_server_errors_from_the_staged_offset(
    upload, respx_mock
) -> None:  # type: ignore[no-untyped-def]
    sleeps = RecordedSleeps()
    respx_mock.head(ARTIFACT_URL).mock(side_effect=[staged_offset(0), staged_offset(4)])
    patch = respx_mock.patch(ARTIFACT_URL).mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(204, headers={"Upload-Offset": "8"}),
        ]
    )

    await upload(sleeps)

    assert sleeps == [1]
    assert patch.calls.last.request.content == b"form"


async def test_artifact_upload_resumes_after_an_offset_conflict(upload, respx_mock) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(side_effect=[staged_offset(0), staged_offset(8)])
    patch = respx_mock.patch(ARTIFACT_URL).mock(
        return_value=httpx.Response(409, headers={"Upload-Offset": "8"})
    )

    await upload()

    assert patch.call_count == 1


async def test_rejected_artifact_upload_is_raised_without_retrying(upload, respx_mock) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(return_value=staged_offset(0))
    patch = respx_mock.patch(ARTIFACT_URL).mock(
        return_value=httpx.Response(400, json={"message": "Invalid artifact upload size."})
    )

    with pytest.raises(httpx.HTTPStatusError) as raised:
        await upload()

    assert patch.call_count == 1
    assert raised.value.response.status_code == 400


async def test_artifact_upload_gives_up_with_the_last_server_error(upload, respx_mock) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(return_value=staged_offset(0))
    patch = respx_mock.patch(ARTIFACT_URL).mock(return_value=httpx.Response(502))

    with pytest.raises(httpx.HTTPStatusError):
        await upload()

    assert patch.call_count == ARTIFACT_UPLOAD_ATTEMPTS


@pytest.mark.parametrize("method", ["head", "patch"])
async def test_artifact_lease_conflict_raises_lease_lost(upload, respx_mock, method: str) -> None:  # type: ignore[no-untyped-def]
    conflict = httpx.Response(409, json={"message": "Media preparation lease is no longer active."})
    respx_mock.head(ARTIFACT_URL).mock(
        return_value=conflict if method == "head" else staged_offset(0)
    )
    respx_mock.patch(ARTIFACT_URL).mock(return_value=conflict)

    with pytest.raises(LeaseLostError):
        await upload()


@pytest.mark.parametrize("headers", [{}, {"Upload-Offset": "eight"}, {"Upload-Offset": "-1"}])
async def test_malformed_upload_offset_is_reported_clearly(
    upload, respx_mock, headers: dict[str, str]
) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(return_value=httpx.Response(200, headers=headers))

    with pytest.raises(ArtifactUploadError, match="Upload-Offset"):
        await upload()


async def test_upload_offset_beyond_the_file_is_rejected(upload, respx_mock) -> None:  # type: ignore[no-untyped-def]
    respx_mock.head(ARTIFACT_URL).mock(return_value=staged_offset(99))

    with pytest.raises(ArtifactUploadError, match="beyond"):
        await upload()
