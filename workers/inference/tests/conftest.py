from pathlib import Path

import pytest
from fakes import RecordingClient

from anysub_worker.config import WorkerSettings
from anysub_worker.models import (
    MediaPreparationJobPayload,
    TranscriptionJobPayload,
    WorkerLease,
)


@pytest.fixture
def settings(tmp_path: Path) -> WorkerSettings:
    return WorkerSettings(
        app_url="http://app.test",
        worker_token="test-worker-token-0123456789",
        data_root=tmp_path,
        model_root=tmp_path / "models",
        worker_id_file=tmp_path / "worker-id",
    )


@pytest.fixture
def transcription_lease() -> WorkerLease:
    return WorkerLease(
        jobId="job-1",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-07-19T00:00:00Z",
        payload=TranscriptionJobPayload(
            kind="transcribe",
            adapterId="builtin.fake",
            modelId="fake-v1",
            projectId="project-1",
            runId="run-1",
            options={"delayMs": 0},
        ),
    )


@pytest.fixture
def media_lease() -> WorkerLease:
    return WorkerLease(
        jobId="job-media",
        attempt=1,
        leaseToken="lease-token",
        leaseExpiresAt="2026-07-21T00:00:00Z",
        payload=MediaPreparationJobPayload(
            kind="media_prepare",
            projectId="project-1",
            sourceStorageKey="source.wav",
            sourceFilename="source.wav",
        ),
    )


@pytest.fixture
def recording_client() -> RecordingClient:
    return RecordingClient()
