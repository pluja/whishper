from __future__ import annotations

from pathlib import Path
from typing import Any

from ..models import MediaProbeArtifact, MediaRational
from ..timing import MICROSECONDS_PER_SECOND
from .errors import MediaPreparationError, MediaToolTimeoutError
from .playback import primary_video
from .process import (
    PROXY_FLOOR_SECONDS,
    PROXY_SECONDS_PER_MEDIA_SECOND,
    THUMBNAIL_TIMEOUT_SECONDS,
    run_media_tool,
    scaled_timeout_seconds,
)


async def generate_thumbnail(source_path: Path, output_directory: Path, duration_us: int) -> Path:
    path = output_directory / "thumbnail.jpg"
    seek_seconds = min(60, max(0, duration_us // (10 * MICROSECONDS_PER_SECOND)))
    for seek in dict.fromkeys((seek_seconds, 0)):
        try:
            await run_media_tool(
                [
                    "-v",
                    "error",
                    "-nostdin",
                    "-y",
                    "-ss",
                    str(seek),
                    "-i",
                    str(source_path),
                    "-map",
                    "0:V:0",
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=640:-2:force_original_aspect_ratio=decrease",
                    "-q:v",
                    "3",
                    str(path),
                ],
                THUMBNAIL_TIMEOUT_SECONDS,
            )
        except MediaPreparationError as error:
            if seek == 0 or isinstance(error, MediaToolTimeoutError):
                raise
            continue
        if path.exists() and path.stat().st_size > 0:
            return path
    raise MediaPreparationError("FFmpeg wrote an empty thumbnail.")


async def generate_proxy(
    source_path: Path, output_directory: Path, probe: MediaProbeArtifact
) -> tuple[Path, str, dict[str, Any]]:
    video = primary_video(probe)
    if video is None:
        path = output_directory / "preview.mp3"
        arguments = [
            "-map",
            "0:a:0",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "3",
            str(path),
        ]
        media_type = "audio/mpeg"
        metadata: dict[str, Any] = {"audioCodec": "mp3"}
    else:
        path = output_directory / "preview.mp4"
        details = video.video
        if details is None:
            raise MediaPreparationError("The source video metadata is incomplete.")
        frame_rate = details.average_frame_rate or details.frame_rate
        if frame_rate is None or not 1 <= frame_rate.numerator / frame_rate.denominator <= 60:
            frame_rate = MediaRational(numerator=30, denominator=1)
        arguments = [
            "-map",
            "0:V:0",
            "-map",
            "0:a:0?",
            "-vf",
            (
                f"fps={frame_rate.numerator}/{frame_rate.denominator},"
                "scale='min(1280,iw)':'min(720,ih)':"
                "force_original_aspect_ratio=decrease:force_divisible_by=2"
            ),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(path),
        ]
        media_type = "video/mp4"
        metadata = {
            "videoCodec": "h264",
            "audioCodec": "aac",
            "constantFrameRate": {
                "numerator": frame_rate.numerator,
                "denominator": frame_rate.denominator,
            },
            "maximumWidth": 1280,
            "maximumHeight": 720,
        }

    await run_media_tool(
        ["-v", "error", "-nostdin", "-y", "-i", str(source_path), *arguments],
        scaled_timeout_seconds(
            probe.duration_us, PROXY_SECONDS_PER_MEDIA_SECOND, PROXY_FLOOR_SECONDS
        ),
    )
    if not path.exists() or path.stat().st_size <= 0:
        raise MediaPreparationError("FFmpeg wrote an empty browser preview.")
    return path, media_type, metadata
