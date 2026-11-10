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
    download_size_bytes: int
    repository: str

    # The Hugging Face cache layout faster-whisper downloads into.
    def cache_directory(self, model_root: Path) -> Path:
        return model_root / f"models--{self.repository.replace('/', '--')}"

    def is_downloaded(self, model_root: Path) -> bool:
        snapshots = self.cache_directory(model_root) / "snapshots"
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


def find_profile(model_id: str) -> ModelProfile | None:
    return next((profile for profile in MODEL_PROFILES if profile.id == model_id), None)


MODEL_PROFILES = (
    ModelProfile(
        id="tiny",
        display_name="Tiny",
        description="Fastest. Best for quick drafts.",
        parameter_count=39_000_000,
        required_vram_bytes=1 * GIB,
        recommended_ram_bytes=2 * GIB,
        download_size_bytes=78_203_619,
        repository="Systran/faster-whisper-tiny",
    ),
    ModelProfile(
        id="base",
        display_name="Base",
        description="Fast, with a little more accuracy than Tiny.",
        parameter_count=74_000_000,
        required_vram_bytes=1 * GIB,
        recommended_ram_bytes=2 * GIB,
        download_size_bytes=147_882_941,
        repository="Systran/faster-whisper-base",
    ),
    ModelProfile(
        id="small",
        display_name="Small",
        description="Best balance of speed and accuracy.",
        parameter_count=244_000_000,
        required_vram_bytes=2 * GIB,
        recommended_ram_bytes=4 * GIB,
        download_size_bytes=486_212_372,
        repository="Systran/faster-whisper-small",
    ),
    ModelProfile(
        id="medium",
        display_name="Medium",
        description="More accurate, but slow without a graphics card.",
        parameter_count=769_000_000,
        required_vram_bytes=5 * GIB,
        recommended_ram_bytes=8 * GIB,
        download_size_bytes=1_530_571_735,
        repository="Systran/faster-whisper-medium",
    ),
    ModelProfile(
        id="large-v3",
        display_name="Large v3",
        description="Highest accuracy. Slowest and most demanding.",
        parameter_count=1_550_000_000,
        required_vram_bytes=10 * GIB,
        recommended_ram_bytes=16 * GIB,
        download_size_bytes=3_090_835_702,
        repository="Systran/faster-whisper-large-v3",
    ),
    ModelProfile(
        id="large-v3-turbo",
        display_name="Large v3 Turbo",
        description="High accuracy. Faster with a supported graphics card.",
        parameter_count=809_000_000,
        required_vram_bytes=3 * GIB,
        recommended_ram_bytes=12 * GIB,
        download_size_bytes=1_621_665_983,
        repository="mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    ),
)
