from __future__ import annotations

import asyncio
import gc
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
    TranscriptCue,
    TranscriptionRequest,
    WordToken,
)

SAMPLE_RATE = 16_000
MODEL_SIZES = {
    "tiny": "Fastest and lightest; useful for drafts.",
    "base": "A small step up in accuracy while remaining CPU-friendly.",
    "small": "Recommended CPU balance for most creators.",
    "medium": "Higher accuracy with substantially higher memory use.",
    "large-v3": "Highest-quality multilingual Whisper model; GPU recommended.",
    "large-v3-turbo": "Fast large-model transcription; GPU recommended.",
}


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
                    displayName=_display_model_name(model_id),
                    capabilities=(AdapterCapability.TRANSCRIBE, AdapterCapability.ALIGN),
                    languages="all",
                    description=description,
                    optionsSchema=option_schema,
                )
                for model_id, description in MODEL_SIZES.items()
            ),
        )

    async def transcribe(
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
        audio = await asyncio.to_thread(whisperx.load_audio, str(media_path))
        duration_us = max(0, int(len(audio) / SAMPLE_RATE * 1_000_000))

        await report_progress(0.08, f"Loading {request.model_id} model")
        model = await self._load_model(whisperx, request.model_id, request.language)

        await report_progress(0.16, "Transcribing speech")
        result = await asyncio.to_thread(model.transcribe, audio, batch_size=batch_size)
        language = str(result.get("language") or request.language or "und")

        if alignment and result.get("segments"):
            await report_progress(0.72, f"Aligning {language} word timestamps")
            align_model, align_metadata = await self._load_align_model(whisperx, language)
            result = await asyncio.to_thread(
                whisperx.align,
                result["segments"],
                align_model,
                align_metadata,
                audio,
                self._settings.device,
                return_char_alignments=False,
            )

        if result.get("segments"):
            await report_progress(0.88, "Splitting readable subtitle cues")
            result = {
                **result,
                "segments": _split_subtitle_segments(
                    result["segments"],
                    language=language,
                    max_line_length=max_line_length,
                ),
            }

        await report_progress(0.94, "Building subtitle cues")
        artifact = _normalize_result(
            result,
            language=language,
            duration_us=duration_us,
            metadata={
                "adapter": "whisperx",
                "model": request.model_id,
                "alignment": alignment,
                "device": self._settings.device,
                "computeType": self._settings.compute_type,
                "batchSize": batch_size,
                "maxLineLength": max_line_length,
            },
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
        self._model = await asyncio.to_thread(
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
        self._align_model, self._align_metadata = await asyncio.to_thread(
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


def _normalize_result(
    result: dict[str, Any],
    *,
    language: str,
    duration_us: int,
    metadata: dict[str, Any],
) -> TranscriptArtifact:
    cues: list[TranscriptCue] = []
    for cue_index, segment in enumerate(result.get("segments") or [], start=1):
        words: list[WordToken] = []
        for word_index, source_word in enumerate(segment.get("words") or [], start=1):
            start = _seconds_to_us(source_word.get("start"))
            end = _seconds_to_us(source_word.get("end"))
            if start is None or end is None or end < start:
                continue
            words.append(
                WordToken(
                    id=f"word-{cue_index:06d}-{word_index:03d}",
                    text=str(source_word.get("word") or "").strip(),
                    startUs=start,
                    endUs=end,
                    confidence=_confidence(source_word.get("score")),
                    speaker=_optional_string(source_word.get("speaker")),
                )
            )

        start_us = _seconds_to_us(segment.get("start"))
        end_us = _seconds_to_us(segment.get("end"))
        if start_us is None:
            start_us = words[0].start_us if words else 0
        if end_us is None:
            end_us = words[-1].end_us if words else start_us
        if words:
            start_us = min(start_us, words[0].start_us)
            end_us = max(end_us, words[-1].end_us)
        end_us = max(start_us, end_us)
        duration_us = max(duration_us, end_us)

        cues.append(
            TranscriptCue(
                id=f"cue-{cue_index:06d}",
                startUs=start_us,
                endUs=end_us,
                text=str(segment.get("text") or "").strip(),
                words=tuple(words),
            )
        )

    return TranscriptArtifact(
        language=language,
        durationUs=duration_us,
        cues=tuple(cues),
        metadata=metadata,
    )


def _split_subtitle_segments(
    segments: list[dict[str, Any]],
    *,
    language: str,
    max_line_length: int,
) -> list[dict[str, Any]]:
    try:
        processor_module = import_module("whisperx.SubtitlesProcessor")
    except ImportError as cause:
        raise AdapterExecutionError(
            "This WhisperX installation does not provide subtitle segmentation.",
            retryable=False,
        ) from cause

    processor_segments: list[dict[str, Any]] = []
    for source in segments:
        segment = {**source}
        if not segment.get("words"):
            segment.pop("words", None)
        else:
            segment["words"] = [dict(word) for word in segment["words"]]
        processor_segments.append(segment)

    processed = processor_module.SubtitlesProcessor(
        processor_segments,
        lang=language,
        max_line_length=max_line_length,
    ).process_segments(advanced_splitting=True)
    timed_words = [
        word
        for segment in processor_segments
        for word in segment.get("words", [])
        if word.get("start") is not None and word.get("end") is not None
    ]

    output: list[dict[str, Any]] = []
    for subtitle in processed:
        start = float(subtitle["start"])
        end = max(start, float(subtitle["end"]))
        words = [
            dict(word)
            for word in timed_words
            if float(word["start"]) >= start - 1e-6 and float(word["end"]) <= end + 1e-6
        ]
        output.extend(
            _enforce_max_line_length(
                {
                    "start": start,
                    "end": end,
                    "text": _clean_subtitle_text(str(subtitle.get("text") or ""), language),
                    **({"words": words} if words else {}),
                },
                language=language,
                max_line_length=max_line_length,
            )
        )
    return output


def _clean_subtitle_text(value: str, language: str) -> str:
    if language in {"zh", "ja"}:
        return value.strip()
    return " ".join(value.split())


def _enforce_max_line_length(
    cue: dict[str, Any],
    *,
    language: str,
    max_line_length: int,
) -> list[dict[str, Any]]:
    if len(str(cue["text"])) <= max_line_length:
        return [cue]

    words = cue.get("words") or []
    if words:
        groups = _group_words(words, language, max_line_length)
        return [
            {
                "start": float(group[0]["start"]),
                "end": float(group[-1]["end"]),
                "text": _join_words(group, language),
                "words": group,
            }
            for group in groups
        ]

    tokens = list(str(cue["text"])) if language in {"zh", "ja"} else str(cue["text"]).split()
    groups = _group_text_tokens(tokens, language, max_line_length)
    total_weight = sum(max(1, len(_join_text_tokens(group, language))) for group in groups)
    elapsed = float(cue["start"])
    duration = max(0.0, float(cue["end"]) - elapsed)
    output: list[dict[str, Any]] = []
    for index, group in enumerate(groups):
        text = _join_text_tokens(group, language)
        share = max(1, len(text)) / total_weight
        end = float(cue["end"]) if index == len(groups) - 1 else elapsed + duration * share
        output.append({"start": elapsed, "end": end, "text": text})
        duration -= end - elapsed
        total_weight -= max(1, len(text))
        elapsed = end
    return output


def _group_words(
    words: list[dict[str, Any]], language: str, maximum: int
) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for word in words:
        candidate = [*current, word]
        if current and len(_join_words(candidate, language)) > maximum:
            groups.append(current)
            current = [word]
        else:
            current = candidate
    if current:
        groups.append(current)
    return groups


def _join_words(words: list[dict[str, Any]], language: str) -> str:
    return _join_text_tokens([str(word.get("word") or "").strip() for word in words], language)


def _group_text_tokens(tokens: list[str], language: str, maximum: int) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    for token in tokens:
        candidate = [*current, token]
        if current and len(_join_text_tokens(candidate, language)) > maximum:
            groups.append(current)
            current = [token]
        else:
            current = candidate
    if current:
        groups.append(current)
    return groups


def _join_text_tokens(tokens: list[str], language: str) -> str:
    separator = "" if language in {"zh", "ja"} else " "
    return separator.join(token for token in tokens if token).strip()


def _display_model_name(model_id: str) -> str:
    if model_id == "large-v3-turbo":
        return "Large v3 Turbo"
    if model_id == "large-v3":
        return "Large v3"
    return model_id.capitalize()


def _seconds_to_us(value: Any) -> int | None:
    if value is None:
        return None
    return max(0, round(float(value) * 1_000_000))


def _confidence(value: Any) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, float(value)))


def _optional_string(value: Any) -> str | None:
    return str(value) if value is not None else None


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
