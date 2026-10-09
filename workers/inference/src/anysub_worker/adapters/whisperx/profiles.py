from __future__ import annotations

import os
from pathlib import Path

from anysub_worker.config import WorkerSettings

GIB = 1024**3
MODEL_PROFILES = {
    "tiny": ("Fastest. Best for quick drafts.", 39_000_000, 1 * GIB, 2 * GIB),
    "base": (
        "Fast, with a little more accuracy than Tiny.",
        74_000_000,
        1 * GIB,
        2 * GIB,
    ),
    "small": (
        "Best balance of speed and accuracy.",
        244_000_000,
        2 * GIB,
        4 * GIB,
    ),
    "medium": (
        "More accurate, but much slower on this computer.",
        769_000_000,
        5 * GIB,
        8 * GIB,
    ),
    "large-v3": (
        "Highest accuracy. Slowest and most demanding.",
        1_550_000_000,
        10 * GIB,
        16 * GIB,
    ),
    "large-v3-turbo": (
        "High accuracy. Faster with a supported graphics card.",
        809_000_000,
        3 * GIB,
        12 * GIB,
    ),
}

MODEL_REPOSITORIES = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large-v3": "Systran/faster-whisper-large-v3",
    "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
}


def model_is_downloaded(model_root: Path, model_id: str) -> bool:
    repository = MODEL_REPOSITORIES.get(model_id)
    if repository is None:
        return False
    snapshots = model_root / f"models--{repository.replace('/', '--')}" / "snapshots"
    try:
        revisions = tuple(snapshots.iterdir())
    except OSError:
        return False
    for revision in revisions:
        if not revision.is_dir():
            continue
        if not (revision / "config.json").is_file():
            continue
        if not (revision / "model.bin").is_file():
            continue
        if (revision / "tokenizer.json").is_file() or any(revision.glob("vocabulary.*")):
            return True
    return False


def configured_model_root(settings: WorkerSettings | None) -> Path:
    if settings is not None:
        return settings.model_root
    return Path(os.environ.get("ANYSUB_MODEL_ROOT", "/models"))


def display_model_name(model_id: str) -> str:
    if model_id == "large-v3-turbo":
        return "Large v3 Turbo"
    if model_id == "large-v3":
        return "Large v3"
    return model_id.capitalize()
