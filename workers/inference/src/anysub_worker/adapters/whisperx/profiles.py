from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

GIB = 1024**3


@dataclass(frozen=True)
class ModelProfile:
    id: str
    display_name: str
    description: str
    parameter_count: int
    required_vram_bytes: int
    recommended_ram_bytes: int
    repository: str

    def is_downloaded(self, model_root: Path) -> bool:
        snapshots = model_root / f"models--{self.repository.replace('/', '--')}" / "snapshots"
        try:
            revisions = tuple(snapshots.iterdir())
        except OSError:
            return False
        return any(_is_complete_snapshot(revision) for revision in revisions)


def _is_complete_snapshot(revision: Path) -> bool:
    return (
        revision.is_dir()
        and (revision / "config.json").is_file()
        and (revision / "model.bin").is_file()
        and ((revision / "tokenizer.json").is_file() or any(revision.glob("vocabulary.*")))
    )


MODEL_PROFILES = (
    ModelProfile(
        id="tiny",
        display_name="Tiny",
        description="Fastest. Best for quick drafts.",
        parameter_count=39_000_000,
        required_vram_bytes=1 * GIB,
        recommended_ram_bytes=2 * GIB,
        repository="Systran/faster-whisper-tiny",
    ),
    ModelProfile(
        id="base",
        display_name="Base",
        description="Fast, with a little more accuracy than Tiny.",
        parameter_count=74_000_000,
        required_vram_bytes=1 * GIB,
        recommended_ram_bytes=2 * GIB,
        repository="Systran/faster-whisper-base",
    ),
    ModelProfile(
        id="small",
        display_name="Small",
        description="Best balance of speed and accuracy.",
        parameter_count=244_000_000,
        required_vram_bytes=2 * GIB,
        recommended_ram_bytes=4 * GIB,
        repository="Systran/faster-whisper-small",
    ),
    ModelProfile(
        id="medium",
        display_name="Medium",
        description="More accurate, but much slower on this computer.",
        parameter_count=769_000_000,
        required_vram_bytes=5 * GIB,
        recommended_ram_bytes=8 * GIB,
        repository="Systran/faster-whisper-medium",
    ),
    ModelProfile(
        id="large-v3",
        display_name="Large v3",
        description="Highest accuracy. Slowest and most demanding.",
        parameter_count=1_550_000_000,
        required_vram_bytes=10 * GIB,
        recommended_ram_bytes=16 * GIB,
        repository="Systran/faster-whisper-large-v3",
    ),
    ModelProfile(
        id="large-v3-turbo",
        display_name="Large v3 Turbo",
        description="High accuracy. Faster with a supported graphics card.",
        parameter_count=809_000_000,
        required_vram_bytes=3 * GIB,
        recommended_ram_bytes=12 * GIB,
        repository="mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    ),
)
