from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..models import (
    MediaDerivativeKind,
    MediaDerivativeUpload,
    MediaProbeArtifact,
    MediaRational,
    MediaVideoDetails,
)
from ..timing import MICROSECONDS_PER_SECOND
from .errors import MediaPreparationError, MediaToolTimeoutError
from .playback import primary_video
from .process import run_media_tool, scaled_timeout_seconds

THUMBNAIL_MAX_WIDTH = 640
# A tenth of the way in skips most intros and fades to black.
THUMBNAIL_SEEK_DIVISOR = 10
THUMBNAIL_MAX_SEEK_SECONDS = 60
THUMBNAIL_TIMEOUT_SECONDS = 300

PROXY_MAX_WIDTH = 1280
PROXY_MAX_HEIGHT = 720
PROXY_MIN_FRAME_RATE = 1
PROXY_MAX_FRAME_RATE = 60
PROXY_FALLBACK_FRAME_RATE = MediaRational(numerator=30, denominator=1)
PROXY_TIMEOUT_FLOOR_SECONDS = 900
PROXY_TIMEOUT_SECONDS_PER_MEDIA_SECOND = 3


@dataclass(frozen=True)
class PreparedDerivative:
    upload: MediaDerivativeUpload
    path: Path


def prepared_derivative(
    kind: MediaDerivativeKind, media_type: str, path: Path, metadata: dict[str, Any]
) -> PreparedDerivative:
    return PreparedDerivative(
        upload=MediaDerivativeUpload(
            kind=kind,
            mediaType=media_type,
            sizeBytes=path.stat().st_size,
            metadata=metadata,
        ),
        path=path,
    )


async def generate_thumbnail(
    source_path: Path, output_directory: Path, duration_us: int
) -> PreparedDerivative:
    path = output_directory / "thumbnail.jpg"
    seek_seconds = min(
        THUMBNAIL_MAX_SEEK_SECONDS,
        duration_us // (THUMBNAIL_SEEK_DIVISOR * MICROSECONDS_PER_SECOND),
    )
    for seek in (seek_seconds, 0) if seek_seconds else (0,):
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
                    f"scale={THUMBNAIL_MAX_WIDTH}:-2:force_original_aspect_ratio=decrease",
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
            return prepared_derivative(
                "thumbnail", "image/jpeg", path, {"widthLimit": THUMBNAIL_MAX_WIDTH}
            )
    raise MediaPreparationError("FFmpeg wrote an empty thumbnail.")


async def generate_proxy(
    source_path: Path, output_directory: Path, probe: MediaProbeArtifact
) -> PreparedDerivative:
    video = primary_video(probe)
    if video is None:
        path = output_directory / "preview.mp3"
        arguments = ["-map", "0:a:0", "-c:a", "libmp3lame", "-q:a", "3", str(path)]
        media_type = "audio/mpeg"
        metadata: dict[str, Any] = {"audioCodec": "mp3"}
    else:
        path = output_directory / "preview.mp4"
        if video.video is None:
            raise MediaPreparationError("The source video metadata is incomplete.")
        frame_rate = _proxy_frame_rate(video.video)
        arguments = [
            "-map",
            "0:V:0",
            "-map",
            "0:a:0?",
            "-vf",
            (
                f"fps={frame_rate.numerator}/{frame_rate.denominator},"
                f"scale='min({PROXY_MAX_WIDTH},iw)':'min({PROXY_MAX_HEIGHT},ih)':"
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
            "constantFrameRate": frame_rate.model_dump(),
            "maximumWidth": PROXY_MAX_WIDTH,
            "maximumHeight": PROXY_MAX_HEIGHT,
        }

    await run_media_tool(
        ["-v", "error", "-nostdin", "-y", "-i", str(source_path), *arguments],
        scaled_timeout_seconds(
            probe.duration_us, PROXY_TIMEOUT_SECONDS_PER_MEDIA_SECOND, PROXY_TIMEOUT_FLOOR_SECONDS
        ),
    )
    if not path.exists() or path.stat().st_size <= 0:
        raise MediaPreparationError("FFmpeg wrote an empty browser preview.")
    return prepared_derivative("proxy", media_type, path, metadata)


def _proxy_frame_rate(video: MediaVideoDetails) -> MediaRational:
    frame_rate = video.average_frame_rate or video.frame_rate
    if frame_rate is None:
        return PROXY_FALLBACK_FRAME_RATE
    frames_per_second = frame_rate.numerator / frame_rate.denominator
    if not PROXY_MIN_FRAME_RATE <= frames_per_second <= PROXY_MAX_FRAME_RATE:
        return PROXY_FALLBACK_FRAME_RATE
    return frame_rate
