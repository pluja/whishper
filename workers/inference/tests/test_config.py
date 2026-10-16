from pathlib import Path

import pytest
from pydantic import ValidationError

from anysub_worker.config import (
    MINIMUM_WORKER_TOKEN_LENGTH,
    AdapterRuntimeSettings,
    WorkerSettings,
)
from anysub_worker.models import WorkerDevice

TOKEN = "t" * MINIMUM_WORKER_TOKEN_LENGTH


def test_worker_name_defaults_to_local_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_NAME", raising=False)

    settings = WorkerSettings(worker_token=TOKEN)

    assert settings.worker_name == "local-worker"


def test_short_worker_token_fails_at_startup_with_the_variable_name() -> None:
    with pytest.raises(ValidationError, match="ANYSUB_WORKER_TOKEN is shorter than 24"):
        WorkerSettings(worker_token="t" * (MINIMUM_WORKER_TOKEN_LENGTH - 1))


def test_missing_worker_token_fails_at_startup_with_the_variable_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_TOKEN", raising=False)

    with pytest.raises(ValidationError, match="ANYSUB_WORKER_TOKEN is not set"):
        WorkerSettings()


def test_runtime_settings_read_the_same_environment(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ANYSUB_DEVICE", "cuda")
    monkeypatch.setenv("ANYSUB_COMPUTE_TYPE", "float16")
    monkeypatch.setenv("ANYSUB_MODEL_ROOT", str(tmp_path))

    runtime = WorkerSettings(worker_token=TOKEN).runtime

    assert (runtime.device, runtime.compute_type, runtime.model_root) == (
        "cuda",
        "float16",
        tmp_path,
    )


@pytest.mark.parametrize("compute_type", ["float16", "int8_float16"])
def test_half_precision_on_cpu_fails_at_startup(compute_type: str) -> None:
    with pytest.raises(ValidationError, match="ANYSUB_COMPUTE_TYPE"):
        AdapterRuntimeSettings(device="cpu", compute_type=compute_type)


@pytest.mark.parametrize(
    ("device", "compute_type"),
    [
        *[
            ("cpu", name)
            for name in (
                "int8",
                "int8_float32",
                "int16",
                "float32",
                "bfloat16",
                "int8_bfloat16",
                "default",
                "auto",
            )
        ],
        *[
            ("cuda", name)
            for name in (
                "int8",
                "int8_float32",
                "int8_float16",
                "int8_bfloat16",
                "int16",
                "float16",
                "float32",
                "bfloat16",
                "default",
                "auto",
                "future_type",
            )
        ],
    ],
)
def test_other_compute_types_are_left_to_ctranslate2(
    device: WorkerDevice, compute_type: str
) -> None:
    runtime = AdapterRuntimeSettings(device=device, compute_type=compute_type)

    assert runtime.compute_type == compute_type
