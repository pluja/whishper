from pathlib import Path

import pytest
from pydantic import ValidationError

from anysub_worker.config import (
    MINIMUM_WORKER_TOKEN_LENGTH,
    AdapterRuntimeSettings,
    WorkerSettings,
)

TOKEN = "t" * MINIMUM_WORKER_TOKEN_LENGTH


def test_worker_name_defaults_to_local_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_NAME", raising=False)

    settings = WorkerSettings(worker_token=TOKEN)

    assert settings.worker_name == "local-worker"


def test_an_empty_worker_name_fails_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANYSUB_WORKER_NAME", "")

    with pytest.raises(ValidationError, match="worker_name"):
        WorkerSettings(worker_token=TOKEN)


def test_short_worker_token_fails_at_startup_with_the_variable_name() -> None:
    with pytest.raises(ValidationError, match="ANYSUB_WORKER_TOKEN is shorter than 24"):
        WorkerSettings(worker_token="t" * (MINIMUM_WORKER_TOKEN_LENGTH - 1))


def test_an_unset_worker_token_uses_the_published_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_TOKEN", raising=False)

    settings = WorkerSettings()

    assert settings.worker_token is None
    assert settings.worker_token_file == Path("/data/.anysub/worker-token")


def test_runtime_settings_read_the_same_environment(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ANYSUB_DEVICE", "cuda")
    monkeypatch.setenv("ANYSUB_MODEL_ROOT", str(tmp_path))

    runtime = WorkerSettings(worker_token=TOKEN).runtime

    assert (runtime.device, runtime.model_root) == ("cuda", tmp_path)


def test_a_leftover_compute_type_variable_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANYSUB_COMPUTE_TYPE", "float16")

    runtime = AdapterRuntimeSettings(device="cpu")

    assert runtime.device == "cpu"
