from pathlib import Path

import pytest

from anysub_worker.media import derivatives, process
from anysub_worker.media.errors import MediaToolTimeoutError


async def test_thumbnail_does_not_retry_after_a_timeout(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = 0

    async def timing_out(*_args: object, **_kwargs: object) -> process.MediaToolResult:
        nonlocal calls
        calls += 1
        raise MediaToolTimeoutError("ffmpeg timed out")

    monkeypatch.setattr(derivatives, "run_media_tool", timing_out)

    with pytest.raises(MediaToolTimeoutError):
        await derivatives.generate_thumbnail(tmp_path / "source.mp4", tmp_path, 600_000_000)

    assert calls == 1


async def test_thumbnail_scales_down_wide_video_but_never_up(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    filters: list[str] = []

    async def writing_thumbnail(arguments: list[str], _timeout: float) -> process.MediaToolResult:
        filters.append(arguments[arguments.index("-vf") + 1])
        Path(arguments[-1]).write_bytes(b"jpeg")
        return process.MediaToolResult(stdout=b"", stderr="")

    monkeypatch.setattr(derivatives, "run_media_tool", writing_thumbnail)

    await derivatives.generate_thumbnail(tmp_path / "source.mp4", tmp_path, 600_000_000)

    assert filters == ["scale='min(640,iw)':-2"]
