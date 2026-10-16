import asyncio
import os
from pathlib import Path

import pytest

from anysub_worker.media import process
from anysub_worker.media.errors import MediaPreparationError, MediaToolTimeoutError


def process_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


async def test_nonzero_exit_reports_the_stderr_tail() -> None:
    script = "seq 1 50 >&2; exit 3"

    with pytest.raises(MediaPreparationError) as raised:
        await process.run_media_tool(["-c", script], 5, program="sh")

    message = str(raised.value)
    assert "exited with code 3" in message
    assert message.endswith("\n".join(str(number) for number in range(31, 51)))
    assert "\n30\n" not in message
    assert not raised.value.retryable


async def test_timeout_kills_the_child_and_keeps_stderr_context(tmp_path: Path) -> None:
    pid_file = tmp_path / "pid"
    script = f"echo $$ > {pid_file}; echo decoder stalled >&2; exec sleep 30"

    with pytest.raises(
        MediaToolTimeoutError, match=r"timed out after 0\.5s: decoder stalled"
    ) as raised:
        await process.run_media_tool(["-c", script], 0.5, program="sh")

    assert not raised.value.retryable
    assert not process_is_alive(int(pid_file.read_text()))


async def test_cancellation_kills_the_child(tmp_path: Path) -> None:
    pid_file = tmp_path / "pid"
    script = f"echo $$ > {pid_file}; exec sleep 30"
    task = asyncio.create_task(process.run_media_tool(["-c", script], 30, program="sh"))
    while not pid_file.exists() or not pid_file.read_text().strip():
        await asyncio.sleep(0.01)

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert not process_is_alive(int(pid_file.read_text()))


async def test_missing_binary_is_not_retryable() -> None:
    with pytest.raises(MediaPreparationError, match="not installed") as raised:
        await process.run_media_tool(["-version"], 5, program="anysub-missing-binary")

    assert not raised.value.retryable


async def test_stdout_streams_to_the_consumer_without_being_retained() -> None:
    chunks: list[bytes] = []

    result = await process.run_media_tool(
        ["-c", "printf abc"], 5, program="sh", on_stdout=chunks.append
    )

    assert b"".join(chunks) == b"abc"
    assert result.stdout == b""


@pytest.mark.parametrize("output", ["", "\n"])
async def test_ffmpeg_version_handles_empty_output(
    monkeypatch: pytest.MonkeyPatch, output: str
) -> None:
    async def fake_run(*_args: object, **_kwargs: object) -> process.MediaToolResult:
        return process.MediaToolResult(stdout=output.encode(), stderr="")

    monkeypatch.setattr(process, "run_media_tool", fake_run)

    assert await process.ffmpeg_version() == "unknown"


async def test_ffmpeg_version_parses_the_banner(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(*_args: object, **_kwargs: object) -> process.MediaToolResult:
        return process.MediaToolResult(stdout=b"ffmpeg version 7.1.1 Copyright\nbuilt", stderr="")

    monkeypatch.setattr(process, "run_media_tool", fake_run)

    assert await process.ffmpeg_version() == "7.1.1"


def test_timeouts_scale_with_duration_above_the_floor() -> None:
    assert process.scaled_timeout_seconds(10_000_000, 3, 900) == 900
    assert process.scaled_timeout_seconds(7_200_000_000, 3, 900) == 21_600
