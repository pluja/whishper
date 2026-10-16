from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..adapter import ProgressReporter
from ..models import (
    FrameRateMode,
    MediaGenerator,
    MediaPreparationJobCompletion,
    MediaProbeArtifact,
)
from .derivatives import PreparedDerivative, generate_proxy, generate_thumbnail
from .errors import MediaPreparationError
from .frame_rate import detect_frame_rate_mode
from .playback import apply_preview_policy, primary_audio, primary_video
from .probe import normalize_probe, probe_source
from .process import ffmpeg_version
from .waveform import generate_waveform


@dataclass(frozen=True)
class PreparedMedia:
    probe: MediaProbeArtifact
    derivatives: tuple[PreparedDerivative, ...]
    generator: MediaGenerator

    @property
    def completion(self) -> MediaPreparationJobCompletion:
        return MediaPreparationJobCompletion(
            probe=self.probe,
            artifacts=tuple(derivative.upload for derivative in self.derivatives),
            generator=self.generator,
        )


async def prepare_media(
    source_path: Path,
    source_filename: str,
    output_directory: Path,
    report_progress: ProgressReporter,
) -> PreparedMedia:
    output_directory.mkdir(parents=True, exist_ok=True)
    await report_progress(0.0, "Probing media")
    probe = normalize_probe(await probe_source(source_path))

    video = primary_video(probe)
    audio = primary_audio(probe)
    if video is None and audio is None:
        raise MediaPreparationError("The source does not contain usable audio or video.")

    frame_rate_mode: FrameRateMode = "unknown"
    if video is not None:
        await report_progress(0.15, "Inspecting frame cadence")
        frame_rate_mode = await detect_frame_rate_mode(source_path, video, probe.duration_us)

    probe = apply_preview_policy(probe, source_filename, frame_rate_mode)
    derivatives: list[PreparedDerivative] = []

    if audio is not None:
        await report_progress(0.3, "Building waveform")
        derivatives.append(
            await generate_waveform(source_path, output_directory, probe.duration_us)
        )

    if video is not None:
        await report_progress(0.55, "Capturing thumbnail")
        derivatives.append(
            await generate_thumbnail(source_path, output_directory, probe.duration_us)
        )

    if probe.proxy_recommended:
        await report_progress(0.7, "Building browser preview")
        derivatives.append(await generate_proxy(source_path, output_directory, probe))

    await report_progress(1.0, "Preparing derivatives for upload")
    return PreparedMedia(
        probe=probe,
        derivatives=tuple(derivatives),
        generator=MediaGenerator(version=await ffmpeg_version()),
    )
