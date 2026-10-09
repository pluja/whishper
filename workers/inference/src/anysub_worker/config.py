from pathlib import Path
from typing import Self

from pydantic import AnyHttpUrl, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

CPU_COMPUTE_TYPES = frozenset({"int8", "int8_float32", "float32", "bfloat16"})
CUDA_COMPUTE_TYPES = frozenset(
    {"int8", "int8_float16", "int8_bfloat16", "float16", "float32", "bfloat16"}
)
COMPUTE_TYPES_BY_DEVICE = {"cpu": CPU_COMPUTE_TYPES, "cuda": CUDA_COMPUTE_TYPES}


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
        supported = COMPUTE_TYPES_BY_DEVICE[self.device]
        if self.compute_type not in supported:
            raise ValueError(
                f"ANYSUB_COMPUTE_TYPE={self.compute_type} is not supported on "
                f"ANYSUB_DEVICE={self.device}. Use one of: {', '.join(sorted(supported))}."
            )
        return self
