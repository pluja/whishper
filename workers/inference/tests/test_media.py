import asyncio
import base64
import os
import struct
from pathlib import Path

import pytest

from anysub_worker.media import MediaPreparationError, derivatives, ffmpeg
from anysub_worker.media.errors import MediaToolTimeoutError
from anysub_worker.media.waveform import (
    WAVEFORM_LEVEL_FACTOR,
    WAVEFORM_MAX_TOP_LEVEL_PEAKS,
    WAVEFORM_SAMPLES_PER_PEAK,
    PeakAccumulator,
    build_levels,
    quantize_sample,
)


def pcm(samples: list[int]) -> bytes:
    return struct.pack(f"<{len(samples)}h", *samples)


def process_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


async def test_nonzero_exit_reports_the_stderr_tail() -> None:
    script = "seq 1 50 >&2; exit 3"

    with pytest.raises(MediaPreparationError) as raised:
        await ffmpeg.run_ffmpeg(["-c", script], 5, program="sh")

    message = str(raised.value)
    assert "exited with code 3" in message
    assert message.endswith("\n".join(str(number) for number in range(31, 51)))
    assert "\n30\n" not in message
    assert not raised.value.retryable


async def test_timeout_kills_the_child_and_keeps_stderr_context(tmp_path: Path) -> None:
    pid_file = tmp_path / "pid"
    script = f"echo decoder stalled >&2; echo $$ > {pid_file}; exec sleep 30"

    with pytest.raises(
        MediaToolTimeoutError, match=r"timed out after 0\.5s: decoder stalled"
    ) as raised:
        await ffmpeg.run_ffmpeg(["-c", script], 0.5, program="sh")

    assert not raised.value.retryable
    assert not process_is_alive(int(pid_file.read_text()))


async def test_cancellation_kills_the_child(tmp_path: Path) -> None:
    pid_file = tmp_path / "pid"
    script = f"echo $$ > {pid_file}; exec sleep 30"
    task = asyncio.create_task(ffmpeg.run_ffmpeg(["-c", script], 30, program="sh"))
    while not pid_file.exists() or not pid_file.read_text().strip():
        await asyncio.sleep(0.01)

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert not process_is_alive(int(pid_file.read_text()))


async def test_missing_binary_is_not_retryable() -> None:
    with pytest.raises(MediaPreparationError, match="not installed") as raised:
        await ffmpeg.run_ffmpeg(["-version"], 5, program="anysub-missing-binary")

    assert not raised.value.retryable


async def test_stdout_streams_to_the_consumer_without_being_retained() -> None:
    chunks: list[bytes] = []

    result = await ffmpeg.run_ffmpeg(["-c", "printf abc"], 5, program="sh", on_stdout=chunks.append)

    assert b"".join(chunks) == b"abc"
    assert result.stdout == b""


@pytest.mark.parametrize("output", ["", "\n"])
async def test_ffmpeg_version_handles_empty_output(monkeypatch, output: str) -> None:  # type: ignore[no-untyped-def]
    async def fake_run(*_args, **_kwargs) -> ffmpeg.FfmpegResult:  # type: ignore[no-untyped-def]
        return ffmpeg.FfmpegResult(stdout=output.encode(), stderr="")

    monkeypatch.setattr(ffmpeg, "run_ffmpeg", fake_run)

    assert await ffmpeg.ffmpeg_version() == "unknown"


async def test_ffmpeg_version_parses_the_banner(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_run(*_args, **_kwargs) -> ffmpeg.FfmpegResult:  # type: ignore[no-untyped-def]
        return ffmpeg.FfmpegResult(stdout=b"ffmpeg version 7.1.1 Copyright\nbuilt", stderr="")

    monkeypatch.setattr(ffmpeg, "run_ffmpeg", fake_run)

    assert await ffmpeg.ffmpeg_version() == "7.1.1"


def test_timeouts_scale_with_duration_above_the_floor() -> None:
    assert ffmpeg.scaled_timeout_seconds(10_000_000, 3, 900) == 900
    assert ffmpeg.scaled_timeout_seconds(7_200_000_000, 3, 900) == 21_600


@pytest.mark.parametrize(
    ("sample", "expected"),
    [(0, 0), (127, 0), (128, 0), (129, 1), (-32768, -128), (32767, 127), (-129, -1)],
)
def test_samples_quantize_to_signed_bytes(sample: int, expected: int) -> None:
    assert quantize_sample(sample) == expected


def test_peaks_are_bucketed_across_chunk_boundaries() -> None:
    bucket = [0] * WAVEFORM_SAMPLES_PER_PEAK
    bucket[3] = -25_600
    bucket[10] = 12_800
    second = [256] * WAVEFORM_SAMPLES_PER_PEAK
    data = pcm(bucket) + pcm(second)
    accumulator = PeakAccumulator()

    accumulator.feed(data[:7])
    accumulator.feed(data[7:301])
    accumulator.feed(data[301:])

    assert accumulator.finish() == [(-100, 50), (1, 1)]


def test_trailing_partial_bucket_becomes_a_final_peak() -> None:
    accumulator = PeakAccumulator()

    accumulator.feed(pcm([-512, 1024, 2048]) + b"\x01")

    assert accumulator.finish() == [(-2, 8)]


def test_no_samples_yield_no_peaks() -> None:
    assert PeakAccumulator().finish() == []


def test_levels_downsample_until_the_top_level_is_small() -> None:
    peak_count = WAVEFORM_MAX_TOP_LEVEL_PEAKS * WAVEFORM_LEVEL_FACTOR + 1
    peaks = [(-1, 1)] * peak_count
    peaks[5] = (-90, 1)
    peaks[-1] = (-1, 100)

    levels = build_levels(peaks)

    assert [level["length"] for level in levels] == [peak_count, 2_001, 501]
    assert [level["samplesPerPeak"] for level in levels] == [
        WAVEFORM_SAMPLES_PER_PEAK,
        WAVEFORM_SAMPLES_PER_PEAK * WAVEFORM_LEVEL_FACTOR,
        WAVEFORM_SAMPLES_PER_PEAK * WAVEFORM_LEVEL_FACTOR**2,
    ]
    top = base64.b64decode(levels[-1]["data"])
    assert (top[0], top[1]) == (-90 + 128, 1 + 128)
    assert (top[-2], top[-1]) == (-1 + 128, 100 + 128)


async def test_thumbnail_does_not_retry_after_a_timeout(monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    calls = 0

    async def timing_out(*_args, **_kwargs) -> ffmpeg.FfmpegResult:  # type: ignore[no-untyped-def]
        nonlocal calls
        calls += 1
        raise MediaToolTimeoutError("ffmpeg timed out")

    monkeypatch.setattr(derivatives, "run_ffmpeg", timing_out)

    with pytest.raises(MediaToolTimeoutError):
        await derivatives.generate_thumbnail(tmp_path / "source.mp4", tmp_path, 600_000_000)

    assert calls == 1
