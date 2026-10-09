from __future__ import annotations

import base64
import json
import struct
from pathlib import Path
from typing import Any

from ..models import MEDIA_PREPARATION_VERSION
from .errors import MediaPreparationError
from .ffmpeg import WAVEFORM_TIMEOUT_SECONDS, run_ffmpeg

WAVEFORM_SAMPLE_RATE = 4_000
WAVEFORM_PEAKS_PER_SECOND = 50
WAVEFORM_SAMPLES_PER_PEAK = WAVEFORM_SAMPLE_RATE // WAVEFORM_PEAKS_PER_SECOND
WAVEFORM_LEVEL_FACTOR = 4
WAVEFORM_MAX_TOP_LEVEL_PEAKS = 2_000
BYTES_PER_SAMPLE = 2

type Peak = tuple[int, int]


def quantize_sample(value: int) -> int:
    return max(-128, min(127, round(value / 256)))


class PeakAccumulator:
    """Folds a stream of signed 16-bit little-endian mono samples into min/max peaks."""

    def __init__(self) -> None:
        self.peaks: list[Peak] = []
        self._pending = b""

    def feed(self, chunk: bytes) -> None:
        self._pending += chunk
        bucket_bytes = WAVEFORM_SAMPLES_PER_PEAK * BYTES_PER_SAMPLE
        complete_bytes = len(self._pending) - (len(self._pending) % bucket_bytes)
        for offset in range(0, complete_bytes, bucket_bytes):
            samples = struct.unpack_from(f"<{WAVEFORM_SAMPLES_PER_PEAK}h", self._pending, offset)
            self.peaks.append(_peak(samples))
        self._pending = self._pending[complete_bytes:]

    def finish(self) -> list[Peak]:
        sample_count = len(self._pending) // BYTES_PER_SAMPLE
        if sample_count:
            samples = struct.unpack(
                f"<{sample_count}h", self._pending[: sample_count * BYTES_PER_SAMPLE]
            )
            self.peaks.append(_peak(samples))
        self._pending = b""
        return self.peaks


def _peak(samples: tuple[int, ...]) -> Peak:
    return quantize_sample(min(samples)), quantize_sample(max(samples))


def build_levels(peaks: list[Peak]) -> list[dict[str, Any]]:
    levels: list[dict[str, Any]] = []
    level_peaks = peaks
    samples_per_peak = WAVEFORM_SAMPLES_PER_PEAK
    while True:
        encoded = bytearray()
        for minimum, maximum in level_peaks:
            encoded.extend((minimum + 128, maximum + 128))
        levels.append(
            {
                "samplesPerPeak": samples_per_peak,
                "peaksPerSecond": WAVEFORM_SAMPLE_RATE / samples_per_peak,
                "length": len(level_peaks),
                "data": base64.b64encode(encoded).decode("ascii"),
            }
        )
        if len(level_peaks) <= WAVEFORM_MAX_TOP_LEVEL_PEAKS:
            return levels
        level_peaks = [
            (
                min(peak[0] for peak in level_peaks[offset : offset + WAVEFORM_LEVEL_FACTOR]),
                max(peak[1] for peak in level_peaks[offset : offset + WAVEFORM_LEVEL_FACTOR]),
            )
            for offset in range(0, len(level_peaks), WAVEFORM_LEVEL_FACTOR)
        ]
        samples_per_peak *= WAVEFORM_LEVEL_FACTOR


async def generate_waveform(
    source_path: Path, output_directory: Path, duration_us: int
) -> tuple[Path, dict[str, Any]]:
    accumulator = PeakAccumulator()
    await run_ffmpeg(
        [
            "-v",
            "error",
            "-nostdin",
            "-i",
            str(source_path),
            "-map",
            "0:a:0",
            "-ac",
            "1",
            "-ar",
            str(WAVEFORM_SAMPLE_RATE),
            "-f",
            "s16le",
            "pipe:1",
        ],
        WAVEFORM_TIMEOUT_SECONDS,
        on_stdout=accumulator.feed,
    )
    peaks = accumulator.finish()
    if not peaks:
        raise MediaPreparationError("FFmpeg produced no waveform samples.")

    levels = build_levels(peaks)
    artifact = {
        "schemaVersion": MEDIA_PREPARATION_VERSION,
        "durationUs": duration_us,
        "sampleRate": WAVEFORM_SAMPLE_RATE,
        "channelMix": "mono",
        "encoding": "signed-int8-min-max-base64",
        "levels": levels,
    }
    path = output_directory / "waveform.json"
    path.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
    return path, {
        "durationUs": duration_us,
        "sampleRate": WAVEFORM_SAMPLE_RATE,
        "basePeaksPerSecond": WAVEFORM_PEAKS_PER_SECOND,
        "levels": len(levels),
        "channelMix": "mono",
        "encoding": "signed-int8-min-max-base64",
    }
