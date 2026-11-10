from pathlib import Path

from pydantic import AnyHttpUrl, Field, PositiveInt, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .models import WorkerDevice

# Matches the web application, which refuses shorter tokens for the same job API.
MINIMUM_WORKER_TOKEN_LENGTH = 24
ENVIRONMENT = SettingsConfigDict(env_prefix="ANYSUB_", extra="ignore")


class AdapterRuntimeSettings(BaseSettings):
    model_config = ENVIRONMENT

    device: WorkerDevice = "cpu"
    data_root: Path = Path("/data")
    model_root: Path = Path("/models")
    # None uses every core the container may run on.
    cpu_threads: PositiveInt | None = None


class WorkerSettings(BaseSettings):
    model_config = ENVIRONMENT

    app_url: AnyHttpUrl = AnyHttpUrl("http://web:3000")
    # Unset means the token the application publishes on the shared volume.
    worker_token: str | None = None
    worker_token_file: Path = Path("/data/.anysub/worker-token")
    worker_name: str = "local-worker"
    worker_id_file: Path = Path("/models/.worker-id")
    request_timeout_seconds: float = 30.0
    runtime: AdapterRuntimeSettings = Field(default_factory=AdapterRuntimeSettings)

    @field_validator("worker_token")
    @classmethod
    def _worker_token_is_long_enough(cls, token: str | None) -> str | None:
        if token is not None and len(token) < MINIMUM_WORKER_TOKEN_LENGTH:
            raise ValueError(
                f"ANYSUB_WORKER_TOKEN is shorter than {MINIMUM_WORKER_TOKEN_LENGTH} "
                "characters. Remove it to use the token the application publishes."
            )
        return token
