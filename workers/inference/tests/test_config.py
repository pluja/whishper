import pytest
from pydantic import ValidationError

from anysub_worker.config import WorkerSettings


def test_worker_name_defaults_to_local_worker(monkeypatch) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_NAME", raising=False)

    settings = WorkerSettings(worker_token="test-token-value")

    assert settings.worker_name == "local-worker"


@pytest.mark.parametrize(
    ("device", "compute_type"),
    [("cpu", "float16"), ("cpu", "int8_float16"), ("cuda", "int16"), ("cpu", "bogus")],
)
def test_incompatible_device_and_compute_type_fail_at_startup(device, compute_type) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValidationError, match="ANYSUB_COMPUTE_TYPE"):
        WorkerSettings(worker_token="test-token-value", device=device, compute_type=compute_type)


@pytest.mark.parametrize(
    ("device", "compute_type"), [("cpu", "int8"), ("cuda", "float16"), ("cuda", "int8")]
)
def test_compatible_device_and_compute_type_are_accepted(device, compute_type) -> None:  # type: ignore[no-untyped-def]
    settings = WorkerSettings(
        worker_token="test-token-value", device=device, compute_type=compute_type
    )

    assert settings.compute_type == compute_type
