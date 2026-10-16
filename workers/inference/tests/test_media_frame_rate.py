from pathlib import Path

import pytest

from anysub_worker.media import frame_rate
from anysub_worker.media.errors import MediaPreparationError
from anysub_worker.media.process import MediaToolResult
from anysub_worker.models import MediaProbeStream, MediaRational, MediaVideoDetails

NTSC = MediaRational(numerator=30000, denominator=1001)


def video(average_frame_rate: MediaRational | None = NTSC) -> MediaProbeStream:
    return MediaProbeStream(
        index=0,
        type="video",
        codec="h264",
        video=MediaVideoDetails(
            width=1280, height=720, frameRate=NTSC, averageFrameRate=average_frame_rate
        ),
    )


def report_vfrdet(monkeypatch: pytest.MonkeyPatch, stderr: str) -> None:
    async def fake_run(*_args: object, **_kwargs: object) -> MediaToolResult:
        return MediaToolResult(stdout=b"", stderr=stderr)

    monkeypatch.setattr(frame_rate, "run_media_tool", fake_run)


@pytest.mark.parametrize(
    ("stderr", "stream", "expected"),
    [
        ("[Parsed_vfrdet_0] VFR:0.000000 (0/299) min: 33 max: 33 avg: 33", video(), "constant"),
        ("[Parsed_vfrdet_0] VFR:0.000000", video(), "constant"),
        ("[Parsed_vfrdet_0] VFR:0.250000 (75/299) min: 33 max: 34 avg: 33", video(), "constant"),
        (
            "[Parsed_vfrdet_0] VFR:0.250000 (75/299) min: 33 max: 34 avg: 33",
            video(average_frame_rate=MediaRational(numerator=24, denominator=1)),
            "variable",
        ),
        ("[Parsed_vfrdet_0] VFR:0.400000 (120/299) min: 20 max: 50 avg: 33", video(), "variable"),
        ("no vfrdet summary", video(), "unknown"),
    ],
)
async def test_vfrdet_summary_decides_the_frame_rate_mode(
    monkeypatch: pytest.MonkeyPatch, stderr: str, stream: MediaProbeStream, expected: str
) -> None:
    report_vfrdet(monkeypatch, stderr)

    assert await frame_rate.detect_frame_rate_mode(Path("clip.mp4"), stream, 1_000_000) == expected


async def test_a_failed_detection_is_unknown_rather_than_fatal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_run(*_args: object, **_kwargs: object) -> MediaToolResult:
        raise MediaPreparationError("ffmpeg exited with code 1")

    monkeypatch.setattr(frame_rate, "run_media_tool", failing_run)

    assert await frame_rate.detect_frame_rate_mode(Path("clip.mp4"), video(), 1_000_000) == (
        "unknown"
    )
