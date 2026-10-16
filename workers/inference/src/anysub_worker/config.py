from pathlib import Path
from typing import Self

from pydantic import AnyHttpUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import WorkerDevice

# CTranslate2 maps every other compute type onto the device, falling back where needed.
# Half-precision floats are the only ones it refuses to run on a CPU.
CPU_REJECTED_COMPUTE_TYPES = frozenset({"float16", "int8_float16"})
# Matches the web application, which refuses shorter tokens for the same job API.
MINIMUM_WORKER_TOKEN_LENGTH = 24
ENVIRONMENT = SettingsConfigDict(env_prefix="ANYSUB_", extra="ignore")


class AdapterRuntimeSettings(BaseSettings):
    model_config = ENVIRONMENT

    device: WorkerDevice = "cpu"
    compute_type: str = "int8"
    data_root: Path = Path("/data")
    model_root: Path = Path("/models")

    @model_validator(mode="after")
    def _compute_type_matches_device(self) -> Self:
        if self.device == "cpu" and self.compute_type in CPU_REJECTED_COMPUTE_TYPES:
            raise ValueError(
                f"ANYSUB_COMPUTE_TYPE={self.compute_type} needs a graphics card and cannot "
                "run with ANYSUB_DEVICE=cpu. Use int8, int8_float32, float32, default or auto."
            )
        return self


class WorkerSettings(BaseSettings):
    model_config = ENVIRONMENT

    app_url: AnyHttpUrl = AnyHttpUrl("http://web:3000")
    worker_token: str
    worker_name: str = "local-worker"
    worker_id_file: Path = Path("/models/.worker-id")
    request_timeout_seconds: float = 30.0
    runtime: AdapterRuntimeSettings = Field(default_factory=AdapterRuntimeSettings)

    @field_validator("worker_token")
    @classmethod
    def _worker_token_is_long_enough(cls, token: str) -> str:
        if len(token) < MINIMUM_WORKER_TOKEN_LENGTH:
            raise ValueError(
                f"ANYSUB_WORKER_TOKEN is shorter than {MINIMUM_WORKER_TOKEN_LENGTH} characters. "
                "It must match the web application's token. Run scripts/init-env.sh to "
                "generate one."
            )
        return token
