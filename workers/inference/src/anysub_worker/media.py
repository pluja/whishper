from __future__ import annotations

import asyncio
import base64
import json
import re
import struct
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from .models import (
    MEDIA_PREPARATION_VERSION,
    MediaAudioDetails,
    MediaDerivativeUpload,
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaProbeArtifact,
    MediaProbeStream,
    MediaRational,
    MediaVideoDetails,
)

ProgressReporter = Callable[[float, str], Awaitable[None]]
WAVEFORM_SAMPLE_RATE = 4_000
WAVEFORM_PEAKS_PER_SECOND = 50
WAVEFORM_SAMPLES_PER_PEAK = WAVEFORM_SAMPLE_RATE // WAVEFORM_PEAKS_PER_SECOND
WAVEFORM_LEVEL_FACTOR = 4


class MediaPreparationError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class PreparedMedia:
    completion: MediaPreparationJobCompletion
    artifacts: dict[str, Path]


async def prepare_media(
    source_path: Path,
    source_filename: str,
    output_directory: Path,
    report_progress: ProgressReporter,
) -> PreparedMedia:
    output_directory.mkdir(parents=True, exist_ok=True)
    await report_progress(0.12, "Probing media")
    raw_probe = await _ffprobe(source_path)
    probe = _normalize_probe(raw_probe)

    video = _primary_video(probe)
    audio = _primary_audio(probe)
    if video is None and audio is None:
        raise MediaPreparationError("The source does not contain usable audio or video.")

    if video is not None:
        await report_progress(0.22, "Inspecting frame cadence")
        frame_rate_mode = await _detect_frame_rate_mode(source_path, video)
    else:
        frame_rate_mode = "unknown"

    probe = _apply_preview_policy(probe, source_filename, frame_rate_mode)
    artifacts: dict[str, Path] = {}
    uploads: list[MediaDerivativeUpload] = []

    if audio is not None:
        await report_progress(0.34, "Building waveform")
        waveform_path, waveform_metadata = await _generate_waveform(
            source_path, output_directory, probe.duration_us
        )
        artifacts["waveform"] = waveform_path
        uploads.append(
            MediaDerivativeUpload(
                kind="waveform",
                mediaType="application/vnd.anysub.waveform+json",
                sizeBytes=waveform_path.stat().st_size,
                metadata=waveform_metadata,
            )
        )

    if video is not None:
        await report_progress(0.52, "Capturing thumbnail")
        thumbnail_path = await _generate_thumbnail(source_path, output_directory, probe.duration_us)
        artifacts["thumbnail"] = thumbnail_path
        uploads.append(
            MediaDerivativeUpload(
                kind="thumbnail",
                mediaType="image/jpeg",
                sizeBytes=thumbnail_path.stat().st_size,
                metadata={"widthLimit": 640},
            )
        )

    if probe.proxy_recommended:
        await report_progress(0.64, "Building browser preview")
        proxy_path, media_type, proxy_metadata = await _generate_proxy(
            source_path, output_directory, probe
        )
        artifacts["proxy"] = proxy_path
        uploads.append(
            MediaDerivativeUpload(
                kind="proxy",
                mediaType=media_type,
                sizeBytes=proxy_path.stat().st_size,
                metadata=proxy_metadata,
            )
        )

    await report_progress(0.86, "Preparing derivatives for upload")
    return PreparedMedia(
        completion=MediaPreparationJobCompletion(
            probe=probe,
            artifacts=tuple(uploads),
            generator=MediaGenerator(version=await _ffmpeg_version()),
        ),
        artifacts=artifacts,
    )


async def _ffprobe(source_path: Path) -> dict[str, Any]:
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
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
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await process.communicate()
    if process.returncode != 0:
        raise MediaPreparationError("FFprobe could not inspect the source media.")
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError as cause:
        raise MediaPreparationError("FFprobe returned invalid metadata.") from cause
    if not isinstance(value, dict):
        raise MediaPreparationError("FFprobe returned invalid metadata.")
    return value


def _normalize_probe(raw: dict[str, Any]) -> MediaProbeArtifact:
    raw_format = raw.get("format") if isinstance(raw.get("format"), dict) else {}
    raw_streams = raw.get("streams") if isinstance(raw.get("streams"), list) else []
    streams = tuple(
        stream
        for value in raw_streams
        if isinstance(value, dict)
        for stream in [_normalize_stream(value)]
        if stream is not None
    )

    duration_us = _seconds_to_us(raw_format.get("duration"))
    if duration_us is None:
        durations = [stream.duration_us for stream in streams if stream.duration_us is not None]
        duration_us = max(durations, default=0)

    format_name = raw_format.get("format_name")
    format_names = tuple(name.strip() for name in str(format_name or "").split(",") if name.strip())
    return MediaProbeArtifact(
        durationUs=duration_us,
        startUs=_seconds_to_us(raw_format.get("start_time")),
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
        durationUs=_seconds_to_us(raw.get("duration")),
        bitRate=_nonnegative_int(raw.get("bit_rate")),
        audio=audio,
        video=video,
    )


async def _detect_frame_rate_mode(source_path: Path, video: MediaProbeStream) -> str:
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
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
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        return "unknown"
    match = re.search(
        rb"VFR:([0-9.]+)(?: \(\d+/\d+\) min: (\d+) max: (\d+) avg: \d+)?",
        stderr,
    )
    if not match:
        return "unknown"
    ratio = Decimal(match.group(1).decode("ascii"))
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


def _apply_preview_policy(
    probe: MediaProbeArtifact, source_filename: str, frame_rate_mode: str
) -> MediaProbeArtifact:
    extension = Path(source_filename).suffix.lower()
    video = _primary_video(probe)
    audio = _primary_audio(probe)
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


async def _generate_waveform(
    source_path: Path, output_directory: Path, duration_us: int
) -> tuple[Path, dict[str, Any]]:
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
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
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    if process.stdout is None:
        raise MediaPreparationError("FFmpeg did not provide waveform samples.")

    peaks: list[tuple[int, int]] = []
    pending = b""
    bucket_bytes = WAVEFORM_SAMPLES_PER_PEAK * 2
    while chunk := await process.stdout.read(64 * 1024):
        pending += chunk
        complete_bytes = len(pending) - (len(pending) % bucket_bytes)
        for offset in range(0, complete_bytes, bucket_bytes):
            samples = struct.unpack_from(f"<{WAVEFORM_SAMPLES_PER_PEAK}h", pending, offset)
            peaks.append((_quantize_sample(min(samples)), _quantize_sample(max(samples))))
        pending = pending[complete_bytes:]

    if len(pending) >= 2:
        sample_count = len(pending) // 2
        samples = struct.unpack(f"<{sample_count}h", pending[: sample_count * 2])
        peaks.append((_quantize_sample(min(samples)), _quantize_sample(max(samples))))

    if await process.wait() != 0 or not peaks:
        raise MediaPreparationError("FFmpeg could not generate waveform peaks.")

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
        if len(level_peaks) <= 2_000:
            break
        level_peaks = [
            (
                min(peak[0] for peak in level_peaks[offset : offset + WAVEFORM_LEVEL_FACTOR]),
                max(peak[1] for peak in level_peaks[offset : offset + WAVEFORM_LEVEL_FACTOR]),
            )
            for offset in range(0, len(level_peaks), WAVEFORM_LEVEL_FACTOR)
        ]
        samples_per_peak *= WAVEFORM_LEVEL_FACTOR

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


async def _generate_thumbnail(source_path: Path, output_directory: Path, duration_us: int) -> Path:
    path = output_directory / "thumbnail.jpg"
    seek_seconds = min(60, max(0, duration_us // 10 // 1_000_000))
    for seek in (seek_seconds, 0):
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
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
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        if await process.wait() == 0 and path.exists() and path.stat().st_size > 0:
            return path
    raise MediaPreparationError("FFmpeg could not capture a thumbnail.")


async def _generate_proxy(
    source_path: Path, output_directory: Path, probe: MediaProbeArtifact
) -> tuple[Path, str, dict[str, Any]]:
    video = _primary_video(probe)
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

    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        str(source_path),
        *arguments,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    if await process.wait() != 0 or not path.exists() or path.stat().st_size <= 0:
        raise MediaPreparationError("FFmpeg could not generate the browser preview.")
    return path, media_type, metadata


async def _ffmpeg_version() -> str:
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-version",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await process.communicate()
    first_line = stdout.decode("utf-8", errors="replace").splitlines()[0]
    parts = first_line.split()
    return parts[2] if len(parts) >= 3 else "unknown"


def _primary_video(probe: MediaProbeArtifact) -> MediaProbeStream | None:
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


def _primary_audio(probe: MediaProbeArtifact) -> MediaProbeStream | None:
    return next((stream for stream in probe.streams if stream.type == "audio"), None)


def _quantize_sample(value: int) -> int:
    return max(-128, min(127, round(value / 256)))


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


def _seconds_to_us(value: object) -> int | None:
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
