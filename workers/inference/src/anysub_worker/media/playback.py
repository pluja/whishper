from __future__ import annotations

from pathlib import Path

from ..models import MediaProbeArtifact, MediaProbeStream


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
