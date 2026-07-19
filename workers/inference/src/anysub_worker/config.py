from pathlib import Path

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANYSUB_", extra="ignore")

    app_url: AnyHttpUrl = "http://web:3000"  # type: ignore[assignment]
    worker_token: str = Field(min_length=8)
    worker_name: str = "local-cpu"
    worker_id_file: Path = Path("/models/.worker-id")
    data_root: Path = Path("/data")
    model_root: Path = Path("/models")
    request_timeout_seconds: float = 30.0
