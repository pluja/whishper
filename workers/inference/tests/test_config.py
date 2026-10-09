from anysub_worker.config import WorkerSettings


def test_worker_name_defaults_to_local_worker(monkeypatch) -> None:
    monkeypatch.delenv("ANYSUB_WORKER_NAME", raising=False)

    settings = WorkerSettings(worker_token="test-token-value")

    assert settings.worker_name == "local-worker"
