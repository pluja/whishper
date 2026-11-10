from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, runtime_checkable

from .errors import JobError
from .models import AdapterManifest, TranscriptArtifact, TranscriptionRequest

ProgressReporter = Callable[[float, str], Awaitable[None]]


class AdapterExecutionError(JobError):
    code = "adapter_error"


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
