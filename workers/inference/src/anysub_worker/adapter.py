from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Protocol, runtime_checkable

from .errors import JobError
from .models import AdapterManifest, TranscriptArtifact, TranscriptionRequest

ProgressReporter = Callable[[float, str], Awaitable[None]]


class AdapterExecutionError(JobError):
    code = "adapter_error"


class AdapterLibraryMissing(RuntimeError):
    """Raised by an adapter's constructor on a worker image built without its libraries.

    Discovery skips the adapter, so the worker never offers models it cannot run.
    """


@runtime_checkable
class Adapter(Protocol):
    """Base contract implemented by every model adapter package.

    Adapters own model-library details and return normalized Anysub artifacts.
    The worker owns job leasing, progress delivery, retries, and application I/O.
    Capability-specific protocols extend this small discovery contract so future
    adapters do not need to implement unrelated operations.
    """

    @property
    def manifest(self) -> AdapterManifest: ...


@runtime_checkable
class TranscriptionAdapter(Adapter, Protocol):
    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact: ...


@runtime_checkable
class ModelCacheAdapter(Adapter, Protocol):
    async def download_model(self, model_id: str, report_progress: ProgressReporter) -> None: ...

    async def delete_model(self, model_id: str) -> None: ...


def require_shared_media(media_path: str | None, data_root: Path) -> Path:
    """Resolves a job's media path, which must be a file on the shared data mount."""
    if not media_path:
        raise AdapterExecutionError("The transcription job has no media path.", retryable=False)
    root = data_root.resolve()
    path = Path(media_path).resolve()
    if not path.is_relative_to(root):
        raise AdapterExecutionError(
            "The media path is outside the worker data mount.", retryable=False
        )
    if not path.is_file():
        raise AdapterExecutionError(
            f"The source media is not available at {path}.", retryable=False
        )
    return path
