from __future__ import annotations

import asyncio
import gc
import logging
from collections.abc import Callable
from importlib import import_module
from importlib.metadata import version
from importlib.util import find_spec
from pathlib import Path
from typing import Any, NamedTuple

from anysub_worker.adapter import (
    AdapterExecutionError,
    AdapterLibraryMissing,
    ProgressReporter,
    require_shared_media,
)
from anysub_worker.config import AdapterRuntimeSettings
from anysub_worker.errors import describe_error
from anysub_worker.hardware import usable_cpu_count
from anysub_worker.models import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    TranscriptArtifact,
    TranscriptionRequest,
)
from anysub_worker.progress import progress_span
from anysub_worker.threads import run_in_thread
from anysub_worker.timing import MICROSECONDS_PER_SECOND
from anysub_worker.transcripts.normalize import normalize_segments
from anysub_worker.transcripts.segments import WhisperSegment

from .cache import delete_profile, download_profile
from .options import TranscriptionOptions, options_schema, parse_options
from .profiles import MODEL_PROFILES, ModelProfile, find_profile
from .subtitles import split_subtitle_segments

SAMPLE_RATE = 16_000
MODEL_DOWNLOAD_SPAN = (0.0, 0.1)
# CTranslate2 reports a compute type the device cannot run as a plain ValueError.
UNSUPPORTED_COMPUTE_TYPE = "compute type"
LOGGER = logging.getLogger(__name__)


class _ModelKey(NamedTuple):
    model_id: str
    compute_type: str


class _Aligner(NamedTuple):
    language: str
    model: Any
    metadata: Any


class WhisperXAdapter:
    """WhisperX ASR plus optional forced alignment behind the adapter v1 contract."""

    def __init__(self, runtime: AdapterRuntimeSettings | None = None) -> None:
        self._runtime = runtime if runtime is not None else AdapterRuntimeSettings()
        self._model: Any | None = None
        self._model_key: _ModelKey | None = None
        self._aligner: _Aligner | None = None

    @property
    def manifest(self) -> AdapterManifest:
        return AdapterManifest(
            id="whisperx",
            displayName="WhisperX",
            version=version("anysub-worker"),
            description="Local Whisper transcription with accurate forced alignment.",
            models=tuple(
                AdapterModel(
                    id=profile.id,
                    displayName=profile.display_name,
                    capabilities=(AdapterCapability.TRANSCRIBE, AdapterCapability.ALIGN),
                    languages="all",
                    description=profile.description,
                    parameterCount=profile.parameter_count,
                    requiredVramBytes=profile.required_vram_bytes,
                    recommendedRamBytes=profile.recommended_ram_bytes,
                    downloadSizeBytes=profile.download_size_bytes,
                    downloaded=profile.is_downloaded(self._model_root),
                    optionsSchema=options_schema(),
                )
                for profile in MODEL_PROFILES
            ),
        )

    async def download_model(self, model_id: str, report_progress: ProgressReporter) -> None:
        await download_profile(self._profile(model_id), self._model_root, report_progress)

    async def delete_model(self, model_id: str) -> None:
        if self._model_key is not None and self._model_key.model_id == model_id:
            self._release_asr_model()
        await delete_profile(self._profile(model_id), self._model_root)

    async def transcribe(
        self, request: TranscriptionRequest, report_progress: ProgressReporter
    ) -> TranscriptArtifact:
        whisperx = _import_whisperx()
        media_path = require_shared_media(request.media_path, self._runtime.data_root)
        options = parse_options(request.options, device=self._runtime.device)
        _require_supported_language(request.language)
        profile = self._profile(request.model_id)
        if not profile.is_downloaded(self._model_root):
            await download_profile(
                profile, self._model_root, progress_span(report_progress, *MODEL_DOWNLOAD_SPAN)
            )

        await report_progress(MODEL_DOWNLOAD_SPAN[1], "Loading source audio")
        audio = await _run_in_thread(whisperx.load_audio, str(media_path))
        try:
            return await self._transcribe_audio(whisperx, audio, request, options, report_progress)
        except asyncio.CancelledError:
            self._release_all_models()
            raise
        except Exception as error:
            self._release_all_models()
            if is_out_of_memory(error):
                hardware = "graphics card" if self._runtime.device == "cuda" else "worker"
                raise AdapterExecutionError(
                    f"The {hardware} ran out of memory. Choose a smaller model or lower "
                    "the batch size.",
                    retryable=False,
                ) from error
            raise

    async def _transcribe_audio(
        self,
        whisperx: Any,
        audio: Any,
        request: TranscriptionRequest,
        options: TranscriptionOptions,
        report_progress: ProgressReporter,
    ) -> TranscriptArtifact:
        duration_us = max(0, int(len(audio) / SAMPLE_RATE * MICROSECONDS_PER_SECOND))

        await report_progress(0.12, f"Loading {request.model_id} model")
        model = await self._load_model(whisperx, _ModelKey(request.model_id, options.compute_type))

        await report_progress(0.16, "Transcribing speech")
        result = await _run_in_thread(
            model.transcribe, audio, batch_size=options.batch_size, language=request.language
        )
        language = str(result.get("language") or request.language or "und")
        segments: list[WhisperSegment] = result.get("segments") or []

        alignment_fallback: str | None = None
        if options.alignment and segments:
            await report_progress(0.72, f"Aligning {language} word timestamps")
            segments, alignment_fallback = await self._align(whisperx, segments, audio, language)

        if segments:
            await report_progress(0.88, "Splitting readable subtitle cues")
            segments = split_subtitle_segments(
                segments, language=language, max_line_length=options.max_line_length
            )

        await report_progress(0.94, "Building subtitle cues")
        metadata: dict[str, Any] = {
            "adapter": "whisperx",
            "model": request.model_id,
            "alignment": options.alignment and alignment_fallback is None,
            "device": self._runtime.device,
            "computeType": options.compute_type,
            "batchSize": options.batch_size,
            "maxLineLength": options.max_line_length,
        }
        if alignment_fallback is not None:
            metadata["alignmentFallback"] = alignment_fallback
        artifact = normalize_segments(
            segments, language=language, duration_us=duration_us, metadata=metadata
        )
        await report_progress(0.99, "Saving aligned transcript")
        return artifact

    async def _align(
        self, whisperx: Any, segments: list[WhisperSegment], audio: Any, language: str
    ) -> tuple[list[WhisperSegment], str | None]:
        """Returns word-aligned segments, or the unaligned ones and why alignment failed."""
        try:
            aligner = await self._load_aligner(whisperx, language)
            aligned = await _run_in_thread(
                whisperx.align,
                segments,
                aligner.model,
                aligner.metadata,
                audio,
                self._runtime.device,
                return_char_alignments=False,
            )
        except Exception as error:
            if is_out_of_memory(error):
                raise
            self._release_align_model()
            fallback = describe_error(error)
            LOGGER.warning(
                "Forced alignment unavailable for %s, keeping unaligned segments: %s",
                language,
                fallback,
            )
            return segments, fallback
        return aligned["segments"], None

    async def _load_model(self, whisperx: Any, key: _ModelKey) -> Any:
        if self._model is not None and self._model_key == key:
            return self._model

        model_id = key.model_id
        self._release_asr_model()
        self._model_root.mkdir(parents=True, exist_ok=True)
        try:
            self._model = await _run_in_thread(
                whisperx.load_model,
                model_id,
                self._runtime.device,
                compute_type=key.compute_type,
                download_root=str(self._model_root),
                threads=self._runtime.cpu_threads or usable_cpu_count(),
                # Downloads run before loading, where they can be cancelled and report progress.
                local_files_only=True,
            )
        except _missing_model_file_errors() as error:
            raise AdapterExecutionError(
                f"The {model_id} model files on this worker are incomplete "
                f"({describe_error(error)}). Remove the model in Administration and download it "
                "again.",
                retryable=False,
            ) from error
        except ValueError as error:
            if UNSUPPORTED_COMPUTE_TYPE not in str(error):
                raise
            raise AdapterExecutionError(
                f"The {model_id} model could not be loaded with {key.compute_type} weights on "
                f"this {self._runtime.device} worker: {error}. Choose another precision in "
                "Administration, then try again.",
                retryable=False,
            ) from error
        self._model_key = key
        return self._model

    async def _load_aligner(self, whisperx: Any, language: str) -> _Aligner:
        if self._aligner is not None and self._aligner.language == language:
            return self._aligner

        self._release_align_model()
        align_root = self._runtime.model_root / "whisperx-align"
        align_root.mkdir(parents=True, exist_ok=True)
        model, metadata = await _run_in_thread(
            whisperx.load_align_model,
            language_code=language,
            device=self._runtime.device,
            model_dir=str(align_root),
        )
        self._aligner = _Aligner(language, model, metadata)
        return self._aligner

    @property
    def _model_root(self) -> Path:
        return self._runtime.model_root / "whisperx"

    def _profile(self, model_id: str) -> ModelProfile:
        profile = find_profile(model_id)
        if profile is None:
            raise AdapterExecutionError(f"Unknown model: {model_id}.", retryable=False)
        return profile

    def _release_asr_model(self) -> None:
        self._model = None
        self._model_key = None
        _release_memory()

    def _release_align_model(self) -> None:
        self._aligner = None
        _release_memory()

    def _release_all_models(self) -> None:
        self._release_asr_model()
        self._release_align_model()


class InstalledWhisperXAdapter(WhisperXAdapter):
    """Skips WhisperX on worker images built without the speech extra."""

    def __init__(self) -> None:
        if find_spec("whisperx") is None:
            raise AdapterLibraryMissing("WhisperX is not installed in this worker image")
        super().__init__()


def _import_whisperx() -> Any:
    try:
        return import_module("whisperx")
    except ImportError as cause:
        raise AdapterExecutionError(
            "WhisperX is not installed in this worker image. Build the production worker "
            "with the speech and CPU or CUDA extras.",
            retryable=False,
        ) from cause


def _require_supported_language(language: str | None) -> None:
    if language is None or language in import_module("whisperx.utils").LANGUAGES:
        return
    raise AdapterExecutionError(
        f"WhisperX cannot transcribe the language code {language}. Choose another language or "
        "automatic detection.",
        retryable=False,
    )


def _missing_model_file_errors() -> tuple[type[Exception], ...]:
    try:
        errors = import_module("huggingface_hub.errors")
    except ImportError:
        return ()
    return (errors.LocalEntryNotFoundError,)


def _release_memory() -> None:
    gc.collect()
    try:
        torch = import_module("torch")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except (ImportError, RuntimeError):
        return


# CTranslate2 and the PyTorch CPU allocator report exhaustion as a plain
# RuntimeError, so only the message tells it apart from other failures.
OUT_OF_MEMORY_MESSAGES = ("out of memory", "can't allocate memory", "bad_alloc")


def is_out_of_memory(error: BaseException) -> bool:
    if isinstance(error, MemoryError):
        return True
    try:
        torch = import_module("torch")
    except ImportError:
        torch = None
    out_of_memory_type = getattr(getattr(torch, "cuda", None), "OutOfMemoryError", None)
    if isinstance(out_of_memory_type, type) and isinstance(error, out_of_memory_type):
        return True
    message = str(error).lower()
    return isinstance(error, RuntimeError) and any(
        text in message for text in OUT_OF_MEMORY_MESSAGES
    )


async def _run_in_thread[Result](
    function: Callable[..., Result], *args: Any, **kwargs: Any
) -> Result:
    # An abandoned call only drops its model references when it returns, so the cache
    # flush waits for that moment.
    return await run_in_thread(function, *args, on_abandoned_exit=_release_memory, **kwargs)
