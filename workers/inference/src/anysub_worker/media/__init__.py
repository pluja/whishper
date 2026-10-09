from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..adapter import ProgressReporter
from ..models import (
    MediaDerivativeUpload,
    MediaGenerator,
    MediaPreparationJobCompletion,
)
from .derivatives import generate_proxy, generate_thumbnail
from .errors import MediaPreparationError
from .ffmpeg import ffmpeg_version
from .probe import (
    apply_preview_policy,
    detect_frame_rate_mode,
    normalize_probe,
    primary_audio,
    primary_video,
    probe_source,
)
from .waveform import generate_waveform

__all__ = ["MediaPreparationError", "PreparedMedia", "prepare_media"]


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
    raw_probe = await probe_source(source_path)
    probe = normalize_probe(raw_probe)

    video = primary_video(probe)
    audio = primary_audio(probe)
    if video is None and audio is None:
        raise MediaPreparationError("The source does not contain usable audio or video.")

    if video is not None:
        await report_progress(0.22, "Inspecting frame cadence")
        frame_rate_mode = await detect_frame_rate_mode(source_path, video, probe.duration_us)
    else:
        frame_rate_mode = "unknown"

    probe = apply_preview_policy(probe, source_filename, frame_rate_mode)
    artifacts: dict[str, Path] = {}
    uploads: list[MediaDerivativeUpload] = []

    if audio is not None:
        await report_progress(0.34, "Building waveform")
        waveform_path, waveform_metadata = await generate_waveform(
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
        thumbnail_path = await generate_thumbnail(source_path, output_directory, probe.duration_us)
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
        proxy_path, media_type, proxy_metadata = await generate_proxy(
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
            generator=MediaGenerator(version=await ffmpeg_version()),
        ),
        artifacts=artifacts,
    )
