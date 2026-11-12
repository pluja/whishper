from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path

from ..adapter import ProgressReporter
from ..media.process import run_media_tool, scaled_timeout_seconds
from ..timing import MICROSECONDS_PER_SECOND, seconds_to_us, us_to_seconds

# Ten minutes of 64 kbit/s mono MP3 is about 5 MB, well under every provider's
# upload limit, and short enough that a failed request costs little to repeat.
CHUNK_US = 600 * MICROSECONDS_PER_SECOND
# Each cut moves back to the latest pause within this window, so no word is split.
CUT_SEARCH_US = 90 * MICROSECONDS_PER_SECOND
SILENCE_FILTER = "silencedetect=noise=-35dB:duration=0.4"
SILENCE_LINE = re.compile(r"lavfi\.silence_(start|end)=(-?[0-9.]+)")
ENCODE_ARGUMENTS = ("-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000")
ENCODE_ARGUMENTS += ("-c:a", "libmp3lame", "-b:a", "64k")


@dataclass(frozen=True)
class AudioChunk:
    path: Path
    start_us: int
    end_us: int


async def prepare_audio_chunks(
    source: Path,
    duration_us: int,
    start_us: int,
    work_directory: Path,
    report: ProgressReporter,
) -> list[AudioChunk]:
    """Encodes the audio in parts on a timeline that starts at 0, like -ss counts.

    start_us is the source's own start time, which the silence timestamps include.
    """
    boundaries = [0, duration_us]
    if duration_us > CHUNK_US:
        await report(0.0, "Finding pauses to split the audio")
        silences = await detect_silences(source, duration_us, start_us, work_directory)
        boundaries = plan_cuts(duration_us, silences)

    chunks: list[AudioChunk] = []
    spans = list(pairwise(boundaries))
    for index, (start_us, end_us) in enumerate(spans):
        await report(index / len(spans), f"Preparing audio part {index + 1} of {len(spans)}")
        path = work_directory / f"part-{index:04d}.mp3"
        await _encode(source, start_us, end_us, path)
        chunks.append(AudioChunk(path=path, start_us=start_us, end_us=end_us))
    return chunks


async def detect_silences(
    source: Path, duration_us: int, start_us: int, work_directory: Path
) -> list[tuple[int, int]]:
    # Relative, so the path needs no escaping inside the filter graph.
    log = "silences.txt"
    await run_media_tool(
        [
            "-nostdin",
            "-hide_banner",
            "-i",
            str(source),
            "-vn",
            "-af",
            f"{SILENCE_FILTER},ametadata=mode=print:file={log}",
            "-f",
            "null",
            "-",
        ],
        scaled_timeout_seconds(duration_us, 0.25, 120),
        cwd=work_directory,
    )
    path = work_directory / log
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    return parse_silences(text, start_us=start_us)


def parse_silences(log: str, *, start_us: int = 0) -> list[tuple[int, int]]:
    silences: list[tuple[int, int]] = []
    started: int | None = None
    for kind, seconds in SILENCE_LINE.findall(log):
        position = max(0, seconds_to_us(float(seconds)) - start_us)
        if kind == "start":
            started = position
        elif started is not None:
            silences.append((started, position))
            started = None
    return silences


def plan_cuts(
    duration_us: int,
    silences: list[tuple[int, int]],
    *,
    chunk_us: int = CHUNK_US,
    search_us: int = CUT_SEARCH_US,
) -> list[int]:
    """Returns the chunk boundaries, from 0 to the duration, each part at most chunk_us long."""
    pauses = sorted((start + end) // 2 for start, end in silences)
    boundaries = [0]
    position = 0
    while duration_us - position > chunk_us:
        target = position + chunk_us
        nearby = [pause for pause in pauses if target - search_us <= pause <= target]
        cut = nearby[-1] if nearby and nearby[-1] > position else target
        boundaries.append(cut)
        position = cut
    boundaries.append(duration_us)
    return boundaries


async def _encode(source: Path, start_us: int, end_us: int, output: Path) -> None:
    span = ["-ss", f"{us_to_seconds(start_us):.3f}", "-i", str(source)]
    if end_us > start_us:
        span += ["-t", f"{us_to_seconds(end_us - start_us):.3f}"]
    await run_media_tool(
        ["-nostdin", "-hide_banner", "-y", *span, *ENCODE_ARGUMENTS, str(output)],
        scaled_timeout_seconds(end_us - start_us, 0.5, 120),
    )
