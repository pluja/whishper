import base64
import struct

import pytest

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
