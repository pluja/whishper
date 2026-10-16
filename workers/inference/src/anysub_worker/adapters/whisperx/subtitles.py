from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections.abc import Callable
from importlib import import_module
from typing import NamedTuple

from anysub_worker.adapter import AdapterExecutionError

from .result import WhisperSegment, WhisperWord

WORD_BOUNDARY_TOLERANCE = 1e-6
UNSPACED_LANGUAGES = frozenset({"zh", "ja"})


class _TimedWord(NamedTuple):
    start: float
    end: float
    word: WhisperWord


def split_subtitle_segments(
    segments: list[WhisperSegment],
    *,
    language: str,
    max_line_length: int,
) -> list[WhisperSegment]:
    try:
        processor_module = import_module("whisperx.SubtitlesProcessor")
    except ImportError as cause:
        raise AdapterExecutionError(
            "This WhisperX installation does not provide subtitle segmentation.",
            retryable=False,
        ) from cause

    processor_segments = [_copy_segment(segment) for segment in segments]
    processed = processor_module.SubtitlesProcessor(
        processor_segments,
        lang=language,
        max_line_length=max_line_length,
    ).process_segments(advanced_splitting=True)
    timed_words = sorted(
        (
            timed
            for segment in processor_segments
            for word in segment.get("words", [])
            if (timed := _timed_word(word)) is not None
        ),
        key=lambda timed: timed.start,
    )
    word_starts = [timed.start for timed in timed_words]

    output: list[WhisperSegment] = []
    for subtitle in processed:
        start = float(subtitle["start"])
        end = max(start, float(subtitle["end"]))
        output.extend(
            _enforce_max_line_length(
                start,
                end,
                _clean_subtitle_text(str(subtitle.get("text") or ""), language),
                _words_within(timed_words, word_starts, start, end),
                language=language,
                max_line_length=max_line_length,
            )
        )
    return output


def _copy_segment(source: WhisperSegment) -> WhisperSegment:
    # The processor splits the text only when a segment has no "words" key at all.
    segment = source.copy()
    words = segment.pop("words", None)
    if words:
        segment["words"] = [word.copy() for word in words]
    return segment


def _timed_word(word: WhisperWord) -> _TimedWord | None:
    start = word.get("start")
    end = word.get("end")
    if start is None or end is None:
        return None
    return _TimedWord(float(start), float(end), word)


def _words_within(
    sorted_words: list[_TimedWord],
    sorted_starts: list[float],
    start: float,
    end: float,
) -> list[_TimedWord]:
    first = bisect_left(sorted_starts, start - WORD_BOUNDARY_TOLERANCE)
    last = bisect_right(sorted_starts, end + WORD_BOUNDARY_TOLERANCE)
    return [
        timed for timed in sorted_words[first:last] if timed.end <= end + WORD_BOUNDARY_TOLERANCE
    ]


def _clean_subtitle_text(value: str, language: str) -> str:
    if language in UNSPACED_LANGUAGES:
        return value.strip()
    return " ".join(value.split())


def _enforce_max_line_length(
    start: float,
    end: float,
    text: str,
    words: list[_TimedWord],
    *,
    language: str,
    max_line_length: int,
) -> list[WhisperSegment]:
    if len(text) <= max_line_length:
        return [_segment(start, end, text, words)]

    if words:
        return [
            _segment(group[0].start, group[-1].end, _join_words(group, language), group)
            for group in _group_by_length(
                words, lambda group: _join_words(group, language), max_line_length
            )
        ]

    tokens = list(text) if language in UNSPACED_LANGUAGES else text.split()
    groups = _group_by_length(
        tokens, lambda group: _join_text_tokens(group, language), max_line_length
    )
    total_weight = sum(max(1, len(_join_text_tokens(group, language))) for group in groups)
    elapsed = start
    remaining = max(0.0, end - elapsed)
    output: list[WhisperSegment] = []
    for index, group in enumerate(groups):
        group_text = _join_text_tokens(group, language)
        share = max(1, len(group_text)) / total_weight
        group_end = end if index == len(groups) - 1 else elapsed + remaining * share
        output.append(_segment(elapsed, group_end, group_text, []))
        remaining -= group_end - elapsed
        total_weight -= max(1, len(group_text))
        elapsed = group_end
    return output


def _segment(start: float, end: float, text: str, words: list[_TimedWord]) -> WhisperSegment:
    segment: WhisperSegment = {"start": start, "end": end, "text": text}
    if words:
        segment["words"] = [timed.word.copy() for timed in words]
    return segment


def _group_by_length[Item](
    items: list[Item], join: Callable[[list[Item]], str], maximum: int
) -> list[list[Item]]:
    groups: list[list[Item]] = []
    current: list[Item] = []
    for item in items:
        candidate = [*current, item]
        if current and len(join(candidate)) > maximum:
            groups.append(current)
            current = [item]
        else:
            current = candidate
    if current:
        groups.append(current)
    return groups


def _join_words(words: list[_TimedWord], language: str) -> str:
    return _join_text_tokens(
        [str(timed.word.get("word") or "").strip() for timed in words], language
    )


def _join_text_tokens(tokens: list[str], language: str) -> str:
    separator = "" if language in UNSPACED_LANGUAGES else " "
    return separator.join(token for token in tokens if token).strip()
