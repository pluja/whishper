from __future__ import annotations

from bisect import bisect_left, bisect_right
from importlib import import_module
from typing import Any

from anysub_worker.adapter import AdapterExecutionError

WORD_BOUNDARY_TOLERANCE = 1e-6


def split_subtitle_segments(
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
    timed_words = sorted(
        (
            word
            for segment in processor_segments
            for word in segment.get("words", [])
            if word.get("start") is not None and word.get("end") is not None
        ),
        key=lambda word: float(word["start"]),
    )
    word_starts = [float(word["start"]) for word in timed_words]

    output: list[dict[str, Any]] = []
    for subtitle in processed:
        start = float(subtitle["start"])
        end = max(start, float(subtitle["end"]))
        words = _words_within(timed_words, word_starts, start, end)
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


def _words_within(
    sorted_words: list[dict[str, Any]],
    sorted_starts: list[float],
    start: float,
    end: float,
) -> list[dict[str, Any]]:
    first = bisect_left(sorted_starts, start - WORD_BOUNDARY_TOLERANCE)
    last = bisect_right(sorted_starts, end + WORD_BOUNDARY_TOLERANCE)
    return [
        dict(word)
        for word in sorted_words[first:last]
        if float(word["end"]) <= end + WORD_BOUNDARY_TOLERANCE
    ]


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
