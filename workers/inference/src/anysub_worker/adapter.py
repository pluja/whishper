from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, runtime_checkable

from .models import AdapterManifest, TranscriptArtifact, TranscriptionRequest

ProgressReporter = Callable[[float, str], Awaitable[None]]


class AdapterExecutionError(RuntimeError):
    """An actionable adapter failure with an explicit queue retry policy."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


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
    """An adapter that implements the transcription capability."""

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact: ...
