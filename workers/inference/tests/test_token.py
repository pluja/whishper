from pathlib import Path

import httpx
import pytest
import respx

from anysub_worker.token import WorkerTokenAuth, WorkerTokenMissing

URL = "http://app.test/api/internal/workers/lease"
PUBLISHED = "p" * 64
ROTATED = "r" * 64


def authorization(route: respx.Route, call: int) -> str:
    return route.calls[call].request.headers["Authorization"]


async def test_a_configured_token_wins_over_the_file(
    tmp_path: Path, respx_mock: respx.MockRouter
) -> None:
    route = respx_mock.post(URL).mock(return_value=httpx.Response(200))
    auth = WorkerTokenAuth("c" * 32, tmp_path / "missing")

    async with httpx.AsyncClient(auth=auth) as client:
        await client.post(URL)

    assert authorization(route, 0) == f"Bearer {'c' * 32}"


async def test_the_published_token_is_read_from_the_shared_volume(
    tmp_path: Path, respx_mock: respx.MockRouter
) -> None:
    token_file = tmp_path / "worker-token"
    token_file.write_text(f"{PUBLISHED}\n", encoding="utf-8")
    route = respx_mock.post(URL).mock(return_value=httpx.Response(200))

    async with httpx.AsyncClient(auth=WorkerTokenAuth(None, token_file)) as client:
        await client.post(URL)

    assert authorization(route, 0) == f"Bearer {PUBLISHED}"


async def test_a_rejected_token_is_read_again_on_the_next_request(
    tmp_path: Path, respx_mock: respx.MockRouter
) -> None:
    token_file = tmp_path / "worker-token"
    token_file.write_text(PUBLISHED, encoding="utf-8")
    route = respx_mock.post(URL).mock(side_effect=[httpx.Response(401), httpx.Response(200)])

    async with httpx.AsyncClient(auth=WorkerTokenAuth(None, token_file)) as client:
        assert (await client.post(URL)).status_code == 401
        token_file.write_text(ROTATED, encoding="utf-8")
        assert (await client.post(URL)).status_code == 200

    assert authorization(route, 1) == f"Bearer {ROTATED}"


async def test_a_missing_token_file_says_what_to_wait_for(tmp_path: Path) -> None:
    auth = WorkerTokenAuth(None, tmp_path / "worker-token")

    async with httpx.AsyncClient(auth=auth) as client:
        with pytest.raises(WorkerTokenMissing, match="writes it when it starts"):
            await client.post(URL)
