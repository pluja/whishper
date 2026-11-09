from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import httpx

from .config import MINIMUM_WORKER_TOKEN_LENGTH


class WorkerTokenMissing(RuntimeError):
    def __init__(self, path: Path) -> None:
        super().__init__(f"no worker token at {path} yet; the application writes it when it starts")


class WorkerTokenAuth(httpx.Auth):
    """Bearer auth with the configured token, or the one the application
    publishes on the shared data volume, re-read after a rejection."""

    def __init__(self, configured: str | None, token_file: Path) -> None:
        self._configured = configured
        self._token_file = token_file
        self._published: str | None = None

    def auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response]:
        request.headers["Authorization"] = f"Bearer {self._token()}"
        response = yield request
        if response.status_code == httpx.codes.UNAUTHORIZED:
            self._published = None

    def _token(self) -> str:
        if self._configured is not None:
            return self._configured
        if self._published is None:
            try:
                token = self._token_file.read_text(encoding="utf-8").strip()
            except FileNotFoundError as missing:
                raise WorkerTokenMissing(self._token_file) from missing
            if len(token) < MINIMUM_WORKER_TOKEN_LENGTH:
                raise WorkerTokenMissing(self._token_file)
            self._published = token
        return self._published
