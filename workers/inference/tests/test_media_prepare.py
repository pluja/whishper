from pathlib import Path
from typing import Any

import pytest

from anysub_worker.media import prepare
from anysub_worker.media.derivatives import PreparedDerivative, prepared_derivative
from anysub_worker.media.errors import MediaPreparationError
from anysub_worker.models import FrameRateMode, MediaProbeArtifact, MediaProbeStream

VIDEO_STREAM = {"index": 0, "codec_type": "video", "codec_name": "h264", "width": 64, "height": 48}
AUDIO_STREAM = {"index": 1, "codec_type": "audio", "codec_name": "aac"}


class FakeMediaTools:
    def __init__(self, monkeypatch: pytest.MonkeyPatch, streams: list[dict[str, Any]]) -> None:
        self.streams = streams
        self.frame_rate_checks = 0
        self.progress: list[tuple[float, str]] = []
        for name in (
            "probe_source",
            "detect_frame_rate_mode",
            "generate_waveform",
            "generate_thumbnail",
            "generate_proxy",
            "ffmpeg_version",
        ):
            monkeypatch.setattr(prepare, name, getattr(self, name))

    async def report(self, progress: float, message: str) -> None:
        self.progress.append((progress, message))

    async def probe_source(self, source_path: Path) -> dict[str, Any]:
        return {"format": {"duration": "2.0"}, "streams": self.streams}

    async def detect_frame_rate_mode(
        self, source_path: Path, video: MediaProbeStream, duration_us: int
    ) -> FrameRateMode:
        self.frame_rate_checks += 1
        return "variable"

    async def generate_waveform(
        self, source_path: Path, output_directory: Path, duration_us: int
    ) -> PreparedDerivative:
        return derivative("waveform", output_directory / "waveform.json")

    async def generate_thumbnail(
        self, source_path: Path, output_directory: Path, duration_us: int
    ) -> PreparedDerivative:
        return derivative("thumbnail", output_directory / "thumbnail.jpg")

    async def generate_proxy(
        self, source_path: Path, output_directory: Path, probe: MediaProbeArtifact
    ) -> PreparedDerivative:
        return derivative("proxy", output_directory / "preview.mp4")

    async def ffmpeg_version(self) -> str:
        return "7.1.1"


def derivative(kind: Any, path: Path) -> PreparedDerivative:
    path.write_bytes(kind.encode())
    return prepared_derivative(kind, "application/octet-stream", path, {})


async def test_video_sources_get_every_derivative_in_the_completion(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    tools = FakeMediaTools(monkeypatch, [VIDEO_STREAM, AUDIO_STREAM])

    prepared = await prepare.prepare_media(
        tmp_path / "source.mp4", "source.mp4", tmp_path / "artifacts", tools.report
    )

    completion = prepared.completion
    assert [upload.kind for upload in completion.artifacts] == ["waveform", "thumbnail", "proxy"]
    assert [derivative.path.name for derivative in prepared.derivatives] == [
        "waveform.json",
        "thumbnail.jpg",
        "preview.mp4",
    ]
    assert completion.probe.frame_rate_mode == "variable"
    assert completion.probe.proxy_reasons == ("variable_frame_rate",)
    assert completion.generator.version == "7.1.1"
    progress = [fraction for fraction, _message in tools.progress]
    assert progress == sorted(progress)
    assert progress[0] == 0 and progress[-1] == 1


async def test_browser_playable_audio_only_gets_a_waveform(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    tools = FakeMediaTools(monkeypatch, [{**AUDIO_STREAM, "codec_name": "mp3"}])

    prepared = await prepare.prepare_media(
        tmp_path / "source.mp3", "song.mp3", tmp_path / "artifacts", tools.report
    )

    assert [upload.kind for upload in prepared.completion.artifacts] == ["waveform"]
    assert prepared.completion.probe.frame_rate_mode == "unknown"
    assert tools.frame_rate_checks == 0


async def test_sources_without_audio_or_video_are_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    tools = FakeMediaTools(monkeypatch, [{"index": 0, "codec_type": "subtitle"}])

    with pytest.raises(MediaPreparationError, match="usable audio or video"):
        await prepare.prepare_media(
            tmp_path / "source.srt", "source.srt", tmp_path / "artifacts", tools.report
        )
