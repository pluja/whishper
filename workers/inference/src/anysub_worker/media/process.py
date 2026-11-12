from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ..timing import us_to_seconds
from .errors import MediaPreparationError, MediaToolTimeoutError

VERSION_TIMEOUT_SECONDS = 10
STDERR_TAIL_LINES = 20
STDERR_TAIL_BYTES = 16 * 1024
READ_CHUNK_BYTES = 64 * 1024


@dataclass(frozen=True)
class MediaToolResult:
    stdout: bytes
    stderr: str


def scaled_timeout_seconds(
    duration_us: int, seconds_per_media_second: float, floor: float
) -> float:
    return max(floor, us_to_seconds(duration_us) * seconds_per_media_second)


async def run_media_tool(
    arguments: Sequence[str],
    timeout: float,
    *,
    program: str = "ffmpeg",
    on_stdout: Callable[[bytes], None] | None = None,
    cwd: Path | None = None,
) -> MediaToolResult:
    """Runs a media tool to completion.

    With `on_stdout`, output is streamed to the callback and not retained, which keeps
    memory flat for large raw streams.
    """
    try:
        process = await asyncio.create_subprocess_exec(
            program,
            *arguments,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
    except FileNotFoundError as cause:
        raise MediaPreparationError(f"{program} is not installed on this worker.") from cause

    retained = bytearray()
    stderr = _StderrTail()
    consume = on_stdout if on_stdout is not None else retained.extend
    try:
        async with asyncio.timeout(timeout):
            await _drain(process, consume, stderr)
    except TimeoutError as cause:
        raise MediaToolTimeoutError(
            f"{program} timed out after {timeout:g}s: {stderr.tail()}"
        ) from cause
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()

    if process.returncode != 0:
        raise MediaPreparationError(
            f"{program} exited with code {process.returncode}: {stderr.tail()}"
        )
    return MediaToolResult(stdout=bytes(retained), stderr=stderr.tail())


async def ffmpeg_version() -> str:
    result = await run_media_tool(["-version"], VERSION_TIMEOUT_SECONDS)
    lines = result.stdout.decode("utf-8", errors="replace").splitlines()
    parts = lines[0].split() if lines else []
    return parts[2] if len(parts) >= 3 else "unknown"


async def _drain(
    process: asyncio.subprocess.Process,
    consume: Callable[[bytes], None],
    stderr: _StderrTail,
) -> None:
    # A TaskGroup wraps task failures in an ExceptionGroup. The first failure
    # cancels the other tasks, so its error is raised unwrapped, with its own cause,
    # for failure_for to classify.
    try:
        async with asyncio.TaskGroup() as tasks:
            tasks.create_task(_drain_stdout(process, consume))
            tasks.create_task(_drain_stderr(process, stderr))
            tasks.create_task(process.wait())
    except ExceptionGroup as group:
        error = group.exceptions[0]
        raise error from error.__cause__


async def _drain_stdout(
    process: asyncio.subprocess.Process, consume: Callable[[bytes], None]
) -> None:
    assert process.stdout is not None
    while chunk := await process.stdout.read(READ_CHUNK_BYTES):
        consume(chunk)


class _StderrTail:
    def __init__(self) -> None:
        self._buffer = b""

    def feed(self, chunk: bytes) -> None:
        self._buffer = (self._buffer + chunk)[-STDERR_TAIL_BYTES:]

    def tail(self) -> str:
        lines = self._buffer.decode("utf-8", errors="replace").splitlines()
        return "\n".join(lines[-STDERR_TAIL_LINES:])


async def _drain_stderr(process: asyncio.subprocess.Process, tail: _StderrTail) -> None:
    assert process.stderr is not None
    while chunk := await process.stderr.read(READ_CHUNK_BYTES):
        tail.feed(chunk)
