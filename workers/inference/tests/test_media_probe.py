from typing import Any

from anysub_worker.media.probe import normalize_probe
from anysub_worker.models import MediaRational


def test_normalizes_ffprobe_output_into_the_probe_artifact() -> None:
    probe = normalize_probe(
        {
            "format": {
                "format_name": "mov,mp4,m4a",
                "format_long_name": "QuickTime / MOV",
                "duration": "12.5",
                "start_time": "0.000000",
                "bit_rate": "800000",
            },
            "streams": [
                {
                    "index": 0,
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "pix_fmt": "yuv420p",
                    "r_frame_rate": "30000/1001",
                    "avg_frame_rate": "30000/1001",
                    "duration": "12.5",
                },
                {
                    "index": 1,
                    "codec_type": "audio",
                    "codec_name": "aac",
                    "sample_rate": "48000",
                    "channels": 2,
                    "channel_layout": "stereo",
                },
                {"index": 2, "codec_type": "timecode", "codec_name": "tmcd"},
                {"codec_type": "audio", "codec_name": "no-index"},
                "not a stream",
            ],
        }
    )

    assert probe.duration_us == 12_500_000
    assert probe.start_us == 0
    assert probe.format_names == ("mov", "mp4", "m4a")
    assert probe.bit_rate == 800_000
    assert [(stream.index, stream.type) for stream in probe.streams] == [
        (0, "video"),
        (1, "audio"),
        (2, "unknown"),
    ]
    video = probe.streams[0].video
    assert video is not None
    assert (video.width, video.height, video.attached_picture) == (1920, 1080, False)
    assert video.frame_rate == MediaRational(numerator=30000, denominator=1001)
    audio = probe.streams[1].audio
    assert audio is not None
    assert (audio.sample_rate, audio.channels, audio.channel_layout) == (48000, 2, "stereo")
    assert probe.seekable is True
    assert probe.frame_rate_mode == "unknown"


def test_duration_falls_back_to_the_longest_stream() -> None:
    probe = normalize_probe(
        {
            "format": {"duration": "N/A"},
            "streams": [
                {"index": 0, "codec_type": "audio", "duration": "3.25"},
                {"index": 1, "codec_type": "audio", "duration": "4.5"},
            ],
        }
    )

    assert probe.duration_us == 4_500_000


def test_cover_art_and_invalid_video_details_are_kept_apart() -> None:
    probe = normalize_probe(
        {
            "streams": [
                {
                    "index": 0,
                    "codec_type": "video",
                    "codec_name": "mjpeg",
                    "width": 600,
                    "height": 600,
                    "r_frame_rate": "0/0",
                    "disposition": {"attached_pic": 1},
                },
                {"index": 1, "codec_type": "video", "codec_name": "h264", "width": 0},
            ]
        }
    )

    cover = probe.streams[0].video
    assert cover is not None
    assert cover.attached_picture is True
    assert cover.frame_rate is None
    assert probe.streams[1].video is None


def test_malformed_ffprobe_output_yields_an_empty_unseekable_probe() -> None:
    raw: dict[str, Any] = {"format": "broken", "streams": {"index": 0}}

    probe = normalize_probe(raw)

    assert probe.streams == ()
    assert probe.duration_us == 0
    assert probe.format_names == ()
    assert probe.seekable is False
