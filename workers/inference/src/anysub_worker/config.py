from pathlib import Path
from typing import Self

from pydantic import AnyHttpUrl, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# CTranslate2 maps every other compute type onto the device, falling back where needed.
# Half-precision floats are the only ones it refuses to run on a CPU.
CPU_REJECTED_COMPUTE_TYPES = frozenset({"float16", "int8_float16"})


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANYSUB_", extra="ignore")

    app_url: AnyHttpUrl = "http://web:3000"  # type: ignore[assignment]
    worker_token: str = Field(min_length=8)
    worker_name: str = "local-worker"
    worker_id_file: Path = Path("/models/.worker-id")
    data_root: Path = Path("/data")
    model_root: Path = Path("/models")
    device: str = Field(default="cpu", pattern="^(cpu|cuda)$")
    compute_type: str = "int8"
    request_timeout_seconds: float = 30.0

    @model_validator(mode="after")
    def _compute_type_matches_device(self) -> Self:
        if self.device == "cpu" and self.compute_type in CPU_REJECTED_COMPUTE_TYPES:
            raise ValueError(
                f"ANYSUB_COMPUTE_TYPE={self.compute_type} needs a graphics card and cannot "
                "run with ANYSUB_DEVICE=cpu. Use int8, int8_float32, float32, default or auto."
            )
        return self
