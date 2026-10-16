from __future__ import annotations

import json
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
from ..timing import MICROSECONDS_PER_SECOND
from .errors import MediaPreparationError
from .process import PROBE_TIMEOUT_SECONDS, run_media_tool


async def probe_source(source_path: Path) -> dict[str, Any]:
    result = await run_media_tool(
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
    return int((seconds * MICROSECONDS_PER_SECOND).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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
