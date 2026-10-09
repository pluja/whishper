from __future__ import annotations

import json
import logging
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from ..models import (
    MediaAudioDetails,
    MediaProbeArtifact,
    MediaProbeStream,
    MediaRational,
    MediaVideoDetails,
)
from .errors import MediaPreparationError
from .ffmpeg import (
    FRAME_RATE_DETECTION_FLOOR_SECONDS,
    FRAME_RATE_DETECTION_SECONDS_PER_MEDIA_SECOND,
    PROBE_TIMEOUT_SECONDS,
    run_ffmpeg,
    scaled_timeout_seconds,
)

LOGGER = logging.getLogger(__name__)


async def probe_source(source_path: Path) -> dict[str, Any]:
    result = await run_ffmpeg(
        [
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-show_entries",
            (
                "format=format_name,format_long_name,start_time,duration,size,bit_rate:"
                "stream=index,codec_type,codec_name,duration,bit_rate,sample_rate,channels,"
                "channel_layout,width,height,pix_fmt,r_frame_rate,avg_frame_rate,disposition"
            ),
            str(source_path),
        ],
        PROBE_TIMEOUT_SECONDS,
        program="ffprobe",
    )
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as cause:
        raise MediaPreparationError("FFprobe returned invalid metadata.") from cause
    if not isinstance(value, dict):
        raise MediaPreparationError("FFprobe returned invalid metadata.")
    return value


def normalize_probe(raw: dict[str, Any]) -> MediaProbeArtifact:
    raw_format = raw.get("format") if isinstance(raw.get("format"), dict) else {}
    raw_streams = raw.get("streams") if isinstance(raw.get("streams"), list) else []
    streams = tuple(
        stream
        for value in raw_streams
        if isinstance(value, dict)
        for stream in [_normalize_stream(value)]
        if stream is not None
    )

    duration_us = ffprobe_seconds_to_us(raw_format.get("duration"))
    if duration_us is None:
        durations = [stream.duration_us for stream in streams if stream.duration_us is not None]
        duration_us = max(durations, default=0)

    format_name = raw_format.get("format_name")
    format_names = tuple(name.strip() for name in str(format_name or "").split(",") if name.strip())
    return MediaProbeArtifact(
        durationUs=duration_us,
        startUs=ffprobe_seconds_to_us(raw_format.get("start_time")),
        formatNames=format_names,
        formatLongName=_string_or_none(raw_format.get("format_long_name")),
        bitRate=_nonnegative_int(raw_format.get("bit_rate")),
        seekable=duration_us > 0,
        frameRateMode="unknown",
        proxyRecommended=False,
        proxyReasons=(),
        streams=streams,
    )


def _normalize_stream(raw: dict[str, Any]) -> MediaProbeStream | None:
    index = _nonnegative_int(raw.get("index"))
    if index is None:
        return None
    raw_type = str(raw.get("codec_type") or "unknown")
    stream_type = (
        raw_type if raw_type in {"audio", "video", "subtitle", "data", "attachment"} else "unknown"
    )
    codec = str(raw.get("codec_name") or "unknown")

    audio = None
    if stream_type == "audio":
        audio = MediaAudioDetails(
            sampleRate=_positive_int(raw.get("sample_rate")),
            channels=_positive_int(raw.get("channels")),
            channelLayout=_string_or_none(raw.get("channel_layout")),
        )

    video = None
    if stream_type == "video":
        width = _positive_int(raw.get("width"))
        height = _positive_int(raw.get("height"))
        if width is not None and height is not None:
            disposition = raw.get("disposition")
            attached_picture = (
                isinstance(disposition, dict) and disposition.get("attached_pic") == 1
            )
            video = MediaVideoDetails(
                width=width,
                height=height,
                pixelFormat=_string_or_none(raw.get("pix_fmt")),
                frameRate=_rational(raw.get("r_frame_rate")),
                averageFrameRate=_rational(raw.get("avg_frame_rate")),
                attachedPicture=attached_picture,
            )

    return MediaProbeStream(
        index=index,
        type=stream_type,
        codec=codec,
        durationUs=ffprobe_seconds_to_us(raw.get("duration")),
        bitRate=_nonnegative_int(raw.get("bit_rate")),
        audio=audio,
        video=video,
    )


async def detect_frame_rate_mode(
    source_path: Path, video: MediaProbeStream, duration_us: int
) -> str:
    try:
        result = await run_ffmpeg(
            [
                "-hide_banner",
                "-nostdin",
                "-i",
                str(source_path),
                "-map",
                "0:V:0",
                "-vf",
                "vfrdet",
                "-an",
                "-f",
                "null",
                "-",
            ],
            scaled_timeout_seconds(
                duration_us,
                FRAME_RATE_DETECTION_SECONDS_PER_MEDIA_SECOND,
                FRAME_RATE_DETECTION_FLOOR_SECONDS,
            ),
        )
    except MediaPreparationError as error:
        LOGGER.warning("frame rate detection failed: %s", error)
        return "unknown"
    match = re.search(
        r"VFR:([0-9.]+)(?: \(\d+/\d+\) min: (\d+) max: (\d+) avg: \d+)?",
        result.stderr,
    )
    if not match:
        return "unknown"
    ratio = Decimal(match.group(1))
    if ratio <= Decimal("0.0001"):
        return "constant"

    details = video.video
    if (
        details is not None
        and details.frame_rate is not None
        and details.frame_rate == details.average_frame_rate
        and match.group(2) is not None
        and match.group(3) is not None
        and int(match.group(3)) - int(match.group(2)) <= 1
    ):
        return "constant"
    return "variable"


def apply_preview_policy(
    probe: MediaProbeArtifact, source_filename: str, frame_rate_mode: str
) -> MediaProbeArtifact:
    extension = Path(source_filename).suffix.lower()
    video = primary_video(probe)
    audio = primary_audio(probe)
    reasons: list[str] = []

    if video is not None:
        video_codec = video.codec
        audio_codec = audio.codec if audio is not None else None
        directly_playable = (
            extension in {".mp4", ".m4v"}
            and video_codec == "h264"
            and audio_codec in {None, "aac", "mp3"}
        ) or (
            extension == ".webm"
            and video_codec in {"vp8", "vp9", "av1"}
            and audio_codec in {None, "opus", "vorbis"}
        )
    elif audio is not None:
        codec = audio.codec
        directly_playable = (
            (extension == ".mp3" and codec == "mp3")
            or (extension == ".wav" and codec.startswith("pcm_"))
            or (extension == ".flac" and codec == "flac")
            or (extension in {".ogg", ".oga", ".opus"} and codec in {"opus", "vorbis"})
            or (extension in {".m4a", ".mp4"} and codec == "aac")
            or (extension == ".webm" and codec in {"opus", "vorbis"})
        )
    else:
        directly_playable = False

    if not directly_playable:
        reasons.append("browser_codec_or_container")
    if probe.duration_us <= 0:
        reasons.append("unreliable_seeking")
    if video is not None and frame_rate_mode == "variable":
        reasons.append("variable_frame_rate")

    return probe.model_copy(
        update={
            "seekable": probe.duration_us > 0 and directly_playable,
            "frame_rate_mode": frame_rate_mode,
            "proxy_recommended": bool(reasons),
            "proxy_reasons": tuple(reasons),
        }
    )


def primary_video(probe: MediaProbeArtifact) -> MediaProbeStream | None:
    return next(
        (
            stream
            for stream in probe.streams
            if stream.type == "video"
            and stream.video is not None
            and not stream.video.attached_picture
        ),
        None,
    )


def primary_audio(probe: MediaProbeArtifact) -> MediaProbeStream | None:
    return next((stream for stream in probe.streams if stream.type == "audio"), None)


def _rational(value: object) -> MediaRational | None:
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"(\d+)/(\d+)", value)
    if not match:
        return None
    numerator, denominator = (int(part) for part in match.groups())
    if numerator <= 0 or denominator <= 0:
        return None
    return MediaRational(numerator=numerator, denominator=denominator)


def ffprobe_seconds_to_us(value: object) -> int | None:
    if value is None or value == "N/A":
        return None
    try:
        seconds = Decimal(str(value))
    except InvalidOperation:
        return None
    if not seconds.is_finite():
        return None
    return int((seconds * 1_000_000).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _positive_int(value: object) -> int | None:
    parsed = _nonnegative_int(value)
    return parsed if parsed is not None and parsed > 0 else None


def _nonnegative_int(value: object) -> int | None:
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _string_or_none(value: object) -> str | None:
    return str(value) if value not in {None, "", "N/A"} else None
