from pathlib import Path

import pytest

from anysub_worker.media import derivatives, process
from anysub_worker.media.errors import MediaToolTimeoutError


async def test_thumbnail_does_not_retry_after_a_timeout(monkeypatch, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    calls = 0

    async def timing_out(*_args, **_kwargs) -> process.MediaToolResult:  # type: ignore[no-untyped-def]
        nonlocal calls
        calls += 1
        raise MediaToolTimeoutError("ffmpeg timed out")

    monkeypatch.setattr(derivatives, "run_media_tool", timing_out)

    with pytest.raises(MediaToolTimeoutError):
        await derivatives.generate_thumbnail(tmp_path / "source.mp4", tmp_path, 600_000_000)

    assert calls == 1
