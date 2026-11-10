import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.adapters.whisperx import cache
from anysub_worker.adapters.whisperx.adapter import WhisperXAdapter
from anysub_worker.adapters.whisperx.adapter import _ModelKey as ModelKey
from anysub_worker.adapters.whisperx.profiles import ModelProfile
from anysub_worker.config import WorkerSettings

PROFILE = ModelProfile(
    id="tiny",
    display_name="Tiny",
    description="Test model",
    parameter_count=1,
    required_vram_bytes=1,
    recommended_ram_bytes=1,
    download_size_bytes=1_000,
    repository="Systran/faster-whisper-tiny",
)

# Writes half the model as a partial blob, waits, then finishes the snapshot the
# way huggingface_hub lays it out.
FINISHING_DOWNLOAD = """
import sys, time
from pathlib import Path
cache = Path(sys.argv[1])
blobs = cache / "blobs"
blobs.mkdir(parents=True, exist_ok=True)
with (blobs / "model.incomplete").open("ab") as partial:
    partial.write(b"x" * 500)
time.sleep(0.4)
(blobs / "model.incomplete").rename(blobs / "model")
snapshot = cache / "snapshots" / "revision"
snapshot.mkdir(parents=True)
for name in ("config.json", "model.bin", "tokenizer.json"):
    (snapshot / name).write_bytes(b"{}")
"""

FAILING_DOWNLOAD = """
import sys
from pathlib import Path
blobs = Path(sys.argv[1]) / "blobs"
blobs.mkdir(parents=True)
(blobs / "model.incomplete").write_bytes(b"x" * 10)
print("Traceback (most recent call last):", file=sys.stderr)
print("OSError: network is unreachable", file=sys.stderr)
sys.exit(1)
"""

STALLED_DOWNLOAD = """
import sys, time
from pathlib import Path
blobs = Path(sys.argv[1]) / "blobs"
blobs.mkdir(parents=True)
(blobs / "model.incomplete").write_bytes(b"x" * 10)
time.sleep(30)
"""


class RecordedProgress:
    def __init__(self) -> None:
        self.fractions: list[float] = []

    async def __call__(self, fraction: float, message: str) -> None:
        self.fractions.append(fraction)


def command(script: str, model_root: Path) -> tuple[str, ...]:
    return (sys.executable, "-c", script, str(PROFILE.cache_directory(model_root)))


@pytest.fixture(autouse=True)
def fast_progress(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cache, "PROGRESS_INTERVAL_SECONDS", 0.05)


async def test_a_download_reports_partial_progress_until_the_snapshot_is_complete(
    tmp_path: Path,
) -> None:
    progress = RecordedProgress()

    await cache.download_profile(
        PROFILE, tmp_path, progress, command=command(FINISHING_DOWNLOAD, tmp_path)
    )

    assert PROFILE.is_downloaded(tmp_path)
    assert progress.fractions[0] == 0.0
    assert progress.fractions[-1] == 1.0
    assert any(0 < fraction < 1 for fraction in progress.fractions)
    assert progress.fractions == sorted(progress.fractions)


async def test_a_resumed_download_continues_from_its_partial_files(tmp_path: Path) -> None:
    partial = PROFILE.cache_directory(tmp_path) / "blobs" / "model.incomplete"
    partial.parent.mkdir(parents=True)
    partial.write_bytes(b"x" * 400)
    progress = RecordedProgress()

    await cache.download_profile(
        PROFILE, tmp_path, progress, command=command(FINISHING_DOWNLOAD, tmp_path)
    )

    assert PROFILE.is_downloaded(tmp_path)
    assert progress.fractions[0] == 0.4
    assert (PROFILE.cache_directory(tmp_path) / "blobs" / "model").stat().st_size == 900


async def test_a_failed_download_is_retryable_and_keeps_its_partial_files(
    tmp_path: Path,
) -> None:
    with pytest.raises(AdapterExecutionError) as raised:
        await cache.download_profile(
            PROFILE, tmp_path, RecordedProgress(), command=command(FAILING_DOWNLOAD, tmp_path)
        )

    assert raised.value.retryable is True
    assert "OSError: network is unreachable" in str(raised.value)
    assert (PROFILE.cache_directory(tmp_path) / "blobs" / "model.incomplete").exists()


async def test_cancelling_a_download_stops_it_and_keeps_its_partial_files(
    tmp_path: Path,
) -> None:
    partial = PROFILE.cache_directory(tmp_path) / "blobs" / "model.incomplete"
    download = asyncio.create_task(
        cache.download_profile(
            PROFILE, tmp_path, RecordedProgress(), command=command(STALLED_DOWNLOAD, tmp_path)
        )
    )
    async with asyncio.timeout(5):
        while not partial.exists():
            await asyncio.sleep(0.02)

    download.cancel()
    async with asyncio.timeout(5):
        with pytest.raises(asyncio.CancelledError):
            await download

    assert partial.exists()


def free_space(monkeypatch: pytest.MonkeyPatch, free: int) -> None:
    monkeypatch.setattr(
        cache.shutil, "disk_usage", lambda path: SimpleNamespace(total=10_000, used=0, free=free)
    )


async def test_a_download_that_does_not_fit_fails_permanently_and_removes_its_partial_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    partial = PROFILE.cache_directory(tmp_path) / "blobs" / "model.incomplete"
    partial.parent.mkdir(parents=True)
    partial.write_bytes(b"x" * 100)
    free_space(monkeypatch, 100)

    with pytest.raises(AdapterExecutionError, match="needs") as raised:
        await cache.download_profile(
            PROFILE, tmp_path, RecordedProgress(), command=command(STALLED_DOWNLOAD, tmp_path)
        )

    assert raised.value.retryable is False
    assert not PROFILE.cache_directory(tmp_path).exists()


async def test_partial_files_count_toward_the_space_a_download_needs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    partial = PROFILE.cache_directory(tmp_path) / "blobs" / "model.incomplete"
    partial.parent.mkdir(parents=True)
    partial.write_bytes(b"x" * 600)
    free_space(monkeypatch, 500)

    await cache.download_profile(
        PROFILE, tmp_path, RecordedProgress(), command=command(FINISHING_DOWNLOAD, tmp_path)
    )

    assert PROFILE.is_downloaded(tmp_path)


async def test_deleting_a_model_removes_its_cache_and_lock_directories(tmp_path: Path) -> None:
    cache_directory = PROFILE.cache_directory(tmp_path)
    (cache_directory / "snapshots" / "revision").mkdir(parents=True)
    lock_directory = tmp_path / ".locks" / cache_directory.name
    lock_directory.mkdir(parents=True)

    await cache.delete_profile(PROFILE, tmp_path)

    assert not cache_directory.exists()
    assert not lock_directory.exists()


async def test_deleting_the_loaded_model_releases_it(settings: WorkerSettings) -> None:
    class LoadingWhisperX:
        def load_model(self, model_id: str, device: str, **kwargs: object) -> object:
            return object()

    adapter = WhisperXAdapter(settings.runtime)
    await adapter._load_model(LoadingWhisperX(), ModelKey("tiny", "int8"))

    await adapter.delete_model("tiny")

    assert adapter._model is None


async def test_an_unknown_model_cannot_be_downloaded(settings: WorkerSettings) -> None:
    with pytest.raises(AdapterExecutionError, match="Unknown model") as raised:
        await WhisperXAdapter(settings.runtime).download_model("huge", RecordedProgress())

    assert raised.value.retryable is False
