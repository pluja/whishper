from __future__ import annotations

import asyncio
import os
import shutil
import sys
from collections.abc import Sequence
from pathlib import Path

from anysub_worker.adapter import AdapterExecutionError, ProgressReporter
from anysub_worker.threads import run_in_thread

from .profiles import ModelProfile

PROGRESS_INTERVAL_SECONDS = 1.0
# The download size is an estimate, so only an exited download reports complete.
MAX_RUNNING_PROGRESS = 0.99
DOWNLOAD_MODULE = f"{__package__}.download"
STDERR_TAIL_BYTES = 4 * 1024


async def download_profile(
    profile: ModelProfile,
    model_root: Path,
    report_progress: ProgressReporter,
    *,
    command: Sequence[str] | None = None,
) -> None:
    model_root.mkdir(parents=True, exist_ok=True)
    cache_directory = profile.cache_directory(model_root)
    _require_free_space(profile, model_root, cache_directory)

    await report_progress(0.0, f"Downloading {profile.display_name}")
    process = await asyncio.create_subprocess_exec(
        *(command or (sys.executable, "-m", DOWNLOAD_MODULE, profile.id, str(model_root))),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        # The Xet transfer client writes each file only once all of it has
        # arrived, so the partial file would stay empty. Plain HTTP fills it
        # as bytes come in, which is what the progress reads.
        env={**os.environ, "HF_HUB_DISABLE_XET": "1"},
    )
    assert process.stderr is not None
    stderr = asyncio.create_task(process.stderr.read())
    try:
        while True:
            try:
                async with asyncio.timeout(PROGRESS_INTERVAL_SECONDS):
                    await process.wait()
                break
            except TimeoutError:
                received = _directory_bytes(cache_directory / "blobs")
                progress = min(received / profile.download_size_bytes, MAX_RUNNING_PROGRESS)
                await report_progress(progress, f"Downloading {profile.display_name}")
        error_output = (await stderr)[-STDERR_TAIL_BYTES:].decode(errors="replace")
    except BaseException:
        stderr.cancel()
        if process.returncode is None:
            process.kill()
            await process.wait()
        _discard_unfinished(profile, model_root)
        raise

    if process.returncode != 0:
        _discard_unfinished(profile, model_root)
        detail = _last_line(error_output) or f"exit status {process.returncode}"
        raise AdapterExecutionError(
            f"The {profile.display_name} model could not be downloaded ({detail}). Check that "
            "the worker can reach huggingface.co, then try again.",
            retryable=True,
        )
    if not profile.is_downloaded(model_root):
        raise AdapterExecutionError(
            f"The {profile.display_name} model download finished without all of its files.",
            retryable=True,
        )
    await report_progress(1.0, f"Downloaded {profile.display_name}")


async def delete_profile(profile: ModelProfile, model_root: Path) -> None:
    cache_directory = profile.cache_directory(model_root)
    lock_directory = model_root / ".locks" / cache_directory.name
    for directory in (cache_directory, lock_directory):
        await run_in_thread(shutil.rmtree, directory, ignore_errors=True)


def _require_free_space(profile: ModelProfile, model_root: Path, cache_directory: Path) -> None:
    missing = profile.download_size_bytes - _directory_bytes(cache_directory / "blobs")
    available = shutil.disk_usage(model_root).free
    if missing > available:
        raise AdapterExecutionError(
            f"The {profile.display_name} model needs {_gigabytes(missing)} of free space, but "
            f"the model volume has {_gigabytes(available)} left. Remove a model or free up "
            "disk space, then try again.",
            retryable=False,
        )


def _directory_bytes(directory: Path) -> int:
    total = 0
    try:
        entries = tuple(directory.iterdir())
    except OSError:
        return 0
    for entry in entries:
        try:
            if entry.is_file() and not entry.is_symlink():
                total += entry.stat().st_size
        except OSError:
            continue
    return total


# Only models that are not downloaded yet are fetched, so an unfinished
# folder holds nothing worth keeping and its disk space goes back.
def _discard_unfinished(profile: ModelProfile, model_root: Path) -> None:
    if not profile.is_downloaded(model_root):
        shutil.rmtree(profile.cache_directory(model_root), ignore_errors=True)


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def _gigabytes(size: int) -> str:
    return f"{size / 1024**3:.1f} GiB"
