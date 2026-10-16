import pytest

from anysub_worker.media.playback import apply_preview_policy
from anysub_worker.models import (
    FrameRateMode,
    MediaAudioDetails,
    MediaProbeArtifact,
    MediaProbeStream,
    MediaVideoDetails,
)


def video_stream(codec: str) -> MediaProbeStream:
    return MediaProbeStream(
        index=0, type="video", codec=codec, video=MediaVideoDetails(width=1280, height=720)
    )


def audio_stream(codec: str) -> MediaProbeStream:
    return MediaProbeStream(index=1, type="audio", codec=codec, audio=MediaAudioDetails())


def probe_of(*streams: MediaProbeStream, duration_us: int = 10_000_000) -> MediaProbeArtifact:
    return MediaProbeArtifact(
        durationUs=duration_us,
        formatNames=(),
        seekable=False,
        frameRateMode="unknown",
        proxyRecommended=False,
        proxyReasons=(),
        streams=streams,
    )


@pytest.mark.parametrize(
    ("filename", "streams"),
    [
        ("clip.mp4", (video_stream("h264"), audio_stream("aac"))),
        ("clip.M4V", (video_stream("h264"),)),
        ("clip.webm", (video_stream("vp9"), audio_stream("opus"))),
        ("song.mp3", (audio_stream("mp3"),)),
        ("take.wav", (audio_stream("pcm_s24le"),)),
        ("take.flac", (audio_stream("flac"),)),
        ("voice.opus", (audio_stream("opus"),)),
        ("voice.m4a", (audio_stream("aac"),)),
    ],
)
def test_browser_playable_sources_need_no_proxy(
    filename: str, streams: tuple[MediaProbeStream, ...]
) -> None:
    probe = apply_preview_policy(probe_of(*streams), filename, "constant")

    assert probe.seekable is True
    assert probe.proxy_recommended is False
    assert probe.proxy_reasons == ()
    assert probe.frame_rate_mode == "constant"


@pytest.mark.parametrize(
    ("filename", "streams"),
    [
        ("clip.mkv", (video_stream("h264"), audio_stream("aac"))),
        ("clip.mp4", (video_stream("hevc"), audio_stream("aac"))),
        ("clip.mp4", (video_stream("h264"), audio_stream("opus"))),
        ("song.wav", (audio_stream("mp3"),)),
        ("data.bin", ()),
    ],
)
def test_unsupported_codecs_or_containers_need_a_proxy(
    filename: str, streams: tuple[MediaProbeStream, ...]
) -> None:
    probe = apply_preview_policy(probe_of(*streams), filename, "unknown")

    assert probe.seekable is False
    assert probe.proxy_reasons == ("browser_codec_or_container",)
    assert probe.proxy_recommended is True


def test_variable_frame_rate_video_needs_a_proxy_but_stays_seekable() -> None:
    probe = apply_preview_policy(probe_of(video_stream("h264")), "clip.mp4", "variable")

    assert probe.seekable is True
    assert probe.proxy_reasons == ("variable_frame_rate",)


@pytest.mark.parametrize("frame_rate_mode", ["variable", "unknown"])
def test_audio_ignores_the_frame_rate_mode(frame_rate_mode: FrameRateMode) -> None:
    probe = apply_preview_policy(probe_of(audio_stream("mp3")), "song.mp3", frame_rate_mode)

    assert probe.proxy_reasons == ()


def test_a_source_without_duration_cannot_be_seeked() -> None:
    probe = apply_preview_policy(
        probe_of(audio_stream("mp3"), duration_us=0), "song.mp3", "unknown"
    )

    assert probe.seekable is False
    assert probe.proxy_reasons == ("unreliable_seeking",)


def test_cover_art_does_not_count_as_video() -> None:
    cover = MediaProbeStream(
        index=0,
        type="video",
        codec="mjpeg",
        video=MediaVideoDetails(width=600, height=600, attachedPicture=True),
    )

    probe = apply_preview_policy(probe_of(cover, audio_stream("mp3")), "song.mp3", "variable")

    assert probe.proxy_reasons == ()
