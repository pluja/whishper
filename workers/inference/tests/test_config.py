import pytest
from pydantic import ValidationError

from anysub_worker.config import WorkerSettings


def test_worker_name_defaults_to_local_worker(monkeypatch) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_NAME", raising=False)

    settings = WorkerSettings(worker_token="test-token-value")

    assert settings.worker_name == "local-worker"


@pytest.mark.parametrize(("device", "compute_type"), [("cpu", "float16"), ("cpu", "int8_float16")])
def test_half_precision_on_cpu_fails_at_startup(device, compute_type) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValidationError, match="ANYSUB_COMPUTE_TYPE"):
        WorkerSettings(worker_token="test-token-value", device=device, compute_type=compute_type)


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
def test_other_compute_types_are_left_to_ctranslate2(device, compute_type) -> None:  # type: ignore[no-untyped-def]
    settings = WorkerSettings(
        worker_token="test-token-value", device=device, compute_type=compute_type
    )

    assert settings.compute_type == compute_type
