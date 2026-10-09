from __future__ import annotations

from typing import Any

from anysub_worker.models import TranscriptArtifact, TranscriptCue, WordToken

TimedWord = tuple[dict[str, Any], int, int]


def normalize_result(
    result: dict[str, Any],
    *,
    language: str,
    duration_us: int,
    metadata: dict[str, Any],
) -> TranscriptArtifact:
    # The server rejects cues whose starts go backwards, so order them before assigning ids.
    bounded_segments = sorted(
        (_segment_bounds(segment) for segment in result.get("segments") or []),
        key=lambda bounded: bounded[0],
    )

    cues: list[TranscriptCue] = []
    for cue_index, (start_us, end_us, segment, timed_words) in enumerate(bounded_segments, start=1):
        duration_us = max(duration_us, end_us)
        cues.append(
            TranscriptCue(
                id=f"cue-{cue_index:06d}",
                startUs=start_us,
                endUs=end_us,
                text=str(segment.get("text") or "").strip(),
                words=tuple(
                    WordToken(
                        id=f"word-{cue_index:06d}-{word_index:03d}",
                        text=str(source_word.get("word") or "").strip(),
                        startUs=word_start,
                        endUs=word_end,
                        confidence=_confidence(source_word.get("score")),
                        speaker=_optional_string(source_word.get("speaker")),
                    )
                    for word_index, (source_word, word_start, word_end) in enumerate(
                        timed_words, start=1
                    )
                ),
            )
        )

    return TranscriptArtifact(
        language=language,
        durationUs=duration_us,
        cues=tuple(cues),
        metadata=metadata,
    )


def _segment_bounds(segment: dict[str, Any]) -> tuple[int, int, dict[str, Any], list[TimedWord]]:
    timed_words: list[TimedWord] = []
    for source_word in segment.get("words") or []:
        start = clamped_seconds_to_us(source_word.get("start"))
        end = clamped_seconds_to_us(source_word.get("end"))
        if start is None or end is None or end < start:
            continue
        timed_words.append((source_word, start, end))

    start_us = clamped_seconds_to_us(segment.get("start"))
    end_us = clamped_seconds_to_us(segment.get("end"))
    if start_us is None:
        start_us = timed_words[0][1] if timed_words else 0
    if end_us is None:
        end_us = timed_words[-1][2] if timed_words else start_us
    if timed_words:
        start_us = min(start_us, timed_words[0][1])
        end_us = max(end_us, timed_words[-1][2])
    return start_us, max(start_us, end_us), segment, timed_words


def clamped_seconds_to_us(value: Any) -> int | None:
    if value is None:
        return None
    return max(0, round(float(value) * 1_000_000))


def _confidence(value: Any) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, float(value)))


def _optional_string(value: Any) -> str | None:
    return str(value) if value is not None else None
