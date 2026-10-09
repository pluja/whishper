from __future__ import annotations

import asyncio
import gc
import logging
from collections.abc import Callable
from importlib import import_module
from pathlib import Path
from typing import Any

from anysub_worker.adapter import AdapterExecutionError, ProgressReporter
from anysub_worker.config import WorkerSettings
from anysub_worker.models import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    TranscriptArtifact,
    TranscriptionRequest,
)

from .normalize import normalize_result
from .profiles import (
    MODEL_PROFILES,
    configured_model_root,
    display_model_name,
    model_is_downloaded,
)
from .subtitles import split_subtitle_segments

SAMPLE_RATE = 16_000
LOGGER = logging.getLogger(__name__)


class WhisperXAdapter:
    """WhisperX ASR plus optional forced alignment behind the adapter v1 contract."""

    def __init__(self, settings: WorkerSettings | None = None) -> None:
        self._settings_override = settings
        self._model: Any | None = None
        self._model_key: tuple[str, str, str, str | None] | None = None
        self._align_model: Any | None = None
        self._align_metadata: Any | None = None
        self._align_key: tuple[str, str] | None = None

    @property
    def manifest(self) -> AdapterManifest:
        option_schema = {
            "type": "object",
            "properties": {
                "alignment": {
                    "type": "boolean",
                    "default": True,
                    "description": "Refine segments to word-level timestamps.",
                },
                "batchSize": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 64,
                    "description": "Inference batch size. Lower this if memory is limited.",
                },
                "maxLineLength": {
                    "type": "integer",
                    "minimum": 20,
                    "maximum": 120,
                    "default": 42,
                    "description": "Maximum subtitle cue length in characters.",
                },
            },
            "additionalProperties": False,
        }
        return AdapterManifest(
            id="whisperx",
            displayName="WhisperX",
            version="0.1.0",
            description="Local Whisper transcription with accurate forced alignment.",
            models=tuple(
                AdapterModel(
                    id=model_id,
                    displayName=display_model_name(model_id),
                    capabilities=(AdapterCapability.TRANSCRIBE, AdapterCapability.ALIGN),
                    languages="all",
                    description=description,
                    parameterCount=parameter_count,
                    requiredVramBytes=required_vram_bytes,
                    recommendedRamBytes=recommended_ram_bytes,
                    downloaded=model_is_downloaded(
                        configured_model_root(self._settings_override) / "whisperx",
                        model_id,
                    ),
                    optionsSchema=option_schema,
                )
                for model_id, (
                    description,
                    parameter_count,
                    required_vram_bytes,
                    recommended_ram_bytes,
                ) in MODEL_PROFILES.items()
            ),
        )

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        try:
            return await self._transcribe(request, report_progress)
        except BaseException as error:
            self._release_all_models()
            if isinstance(error, Exception) and is_cuda_out_of_memory(error):
                raise AdapterExecutionError(
                    "The graphics card ran out of memory. Choose a smaller model or lower "
                    "the batch size.",
                    retryable=False,
                ) from error
            raise

    async def _transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        whisperx = _import_whisperx()
        media_path = self._media_path(request.media_path)
        alignment = _boolean_option(request.options, "alignment", True)
        batch_size = _integer_option(
            request.options,
            "batchSize",
            default=16 if self._settings.device == "cuda" else 4,
            minimum=1,
            maximum=64,
        )
        max_line_length = _integer_option(
            request.options,
            "maxLineLength",
            default=42,
            minimum=20,
            maximum=120,
        )

        await report_progress(0.02, "Loading source audio")
        audio = await _run_in_thread(whisperx.load_audio, str(media_path))
        duration_us = max(0, int(len(audio) / SAMPLE_RATE * 1_000_000))

        await report_progress(0.08, f"Loading {request.model_id} model")
        model = await self._load_model(whisperx, request.model_id, request.language)

        await report_progress(0.16, "Transcribing speech")
        result = await _run_in_thread(model.transcribe, audio, batch_size=batch_size)
        language = str(result.get("language") or request.language or "und")

        alignment_fallback: str | None = None
        if alignment and result.get("segments"):
            await report_progress(0.72, f"Aligning {language} word timestamps")
            try:
                align_model, align_metadata = await self._load_align_model(whisperx, language)
                result = await _run_in_thread(
                    whisperx.align,
                    result["segments"],
                    align_model,
                    align_metadata,
                    audio,
                    self._settings.device,
                    return_char_alignments=False,
                )
            except Exception as error:
                if is_cuda_out_of_memory(error):
                    raise
                self._release_align_model()
                alignment_fallback = f"{type(error).__name__}: {error}"
                LOGGER.warning(
                    "Forced alignment unavailable for %s, keeping unaligned segments: %s",
                    language,
                    alignment_fallback,
                )

        if result.get("segments"):
            await report_progress(0.88, "Splitting readable subtitle cues")
            result = {
                **result,
                "segments": split_subtitle_segments(
                    result["segments"],
                    language=language,
                    max_line_length=max_line_length,
                ),
            }

        await report_progress(0.94, "Building subtitle cues")
        metadata: dict[str, Any] = {
            "adapter": "whisperx",
            "model": request.model_id,
            "alignment": alignment and alignment_fallback is None,
            "device": self._settings.device,
            "computeType": self._settings.compute_type,
            "batchSize": batch_size,
            "maxLineLength": max_line_length,
        }
        if alignment_fallback is not None:
            metadata["alignmentFallback"] = alignment_fallback
        artifact = normalize_result(
            result, language=language, duration_us=duration_us, metadata=metadata
        )
        await report_progress(0.99, "Saving aligned transcript")
        return artifact

    async def _load_model(self, whisperx: Any, model_id: str, language: str | None) -> Any:
        key = (model_id, self._settings.device, self._settings.compute_type, language)
        if self._model is not None and self._model_key == key:
            return self._model

        self._release_asr_model()
        model_root = self._settings.model_root / "whisperx"
        model_root.mkdir(parents=True, exist_ok=True)
        kwargs: dict[str, Any] = {
            "compute_type": self._settings.compute_type,
            "download_root": str(model_root),
        }
        if language:
            kwargs["language"] = language
        self._model = await _run_in_thread(
            whisperx.load_model,
            model_id,
            self._settings.device,
            **kwargs,
        )
        self._model_key = key
        return self._model

    @property
    def _settings(self) -> WorkerSettings:
        if self._settings_override is None:
            self._settings_override = WorkerSettings()  # type: ignore[call-arg]
        return self._settings_override

    async def _load_align_model(self, whisperx: Any, language: str) -> tuple[Any, Any]:
        key = (language, self._settings.device)
        if self._align_model is not None and self._align_key == key:
            return self._align_model, self._align_metadata

        self._release_align_model()
        align_root = self._settings.model_root / "whisperx-align"
        align_root.mkdir(parents=True, exist_ok=True)
        self._align_model, self._align_metadata = await _run_in_thread(
            whisperx.load_align_model,
            language_code=language,
            device=self._settings.device,
            model_dir=str(align_root),
        )
        self._align_key = key
        return self._align_model, self._align_metadata

    def _media_path(self, value: str | None) -> Path:
        if not value:
            raise AdapterExecutionError("The transcription job has no media path.", retryable=False)
        root = self._settings.data_root.resolve()
        path = Path(value).resolve()
        if not path.is_relative_to(root):
            raise AdapterExecutionError(
                "The media path is outside the worker data mount.", retryable=False
            )
        if not path.is_file():
            raise AdapterExecutionError(
                f"The source media is not available at {path}.", retryable=False
            )
        return path

    def _release_asr_model(self) -> None:
        self._model = None
        self._model_key = None
        _release_memory()

    def _release_all_models(self) -> None:
        self._model = None
        self._model_key = None
        self._align_model = None
        self._align_metadata = None
        self._align_key = None
        _release_memory()

    def _release_align_model(self) -> None:
        self._align_model = None
        self._align_metadata = None
        self._align_key = None
        _release_memory()


def _import_whisperx() -> Any:
    try:
        return import_module("whisperx")
    except ImportError as cause:
        raise AdapterExecutionError(
            "WhisperX is not installed in this worker image. Build the production worker "
            "with the speech and CPU or CUDA extras.",
            retryable=False,
        ) from cause


def _boolean_option(options: dict[str, Any], name: str, default: bool) -> bool:
    value = options.get(name, default)
    if not isinstance(value, bool):
        raise AdapterExecutionError(f"{name} must be a boolean.", retryable=False)
    return value


def _integer_option(
    options: dict[str, Any], name: str, *, default: int, minimum: int, maximum: int
) -> int:
    value = options.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise AdapterExecutionError(
            f"{name} must be an integer between {minimum} and {maximum}.", retryable=False
        )
    return value


def _release_memory() -> None:
    gc.collect()
    try:
        torch = import_module("torch")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except (ImportError, RuntimeError):
        return


def is_cuda_out_of_memory(error: BaseException) -> bool:
    try:
        torch = import_module("torch")
    except ImportError:
        return False
    out_of_memory_type = getattr(getattr(torch, "cuda", None), "OutOfMemoryError", None)
    return isinstance(out_of_memory_type, type) and isinstance(error, out_of_memory_type)


async def _run_in_thread[Result](
    function: Callable[..., Result], *args: Any, **kwargs: Any
) -> Result:
    """Run blocking inference off the loop and flush GPU memory once an abandoned call ends.

    A cancelled await cannot stop the thread. Its model references only drop when the call
    returns, so the cache flush is deferred to that moment.
    """
    inference = asyncio.ensure_future(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(inference)
    except asyncio.CancelledError:
        inference.add_done_callback(_flush_after_abandoned_call)
        raise


def _flush_after_abandoned_call(inference: asyncio.Future[Any]) -> None:
    if not inference.cancelled():
        inference.exception()
    _release_memory()
