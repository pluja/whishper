from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections.abc import Callable
from typing import NamedTuple

from .segments import WhisperSegment, WhisperWord

WORD_BOUNDARY_TOLERANCE = 1e-6
UNSPACED_LANGUAGES = frozenset({"zh", "ja"})


class TimedWord(NamedTuple):
    start: float
    end: float
    word: WhisperWord


def timed_word(word: WhisperWord) -> TimedWord | None:
    start = word.get("start")
    end = word.get("end")
    if start is None or end is None:
        return None
    return TimedWord(float(start), float(end), word)


def sorted_timed_words(words: list[WhisperWord]) -> list[TimedWord]:
    return sorted(
        (timed for word in words if (timed := timed_word(word)) is not None),
        key=lambda timed: timed.start,
    )


def words_within(
    sorted_words: list[TimedWord],
    sorted_starts: list[float],
    start: float,
    end: float,
) -> list[TimedWord]:
    first = bisect_left(sorted_starts, start - WORD_BOUNDARY_TOLERANCE)
    last = bisect_right(sorted_starts, end + WORD_BOUNDARY_TOLERANCE)
    return [
        timed for timed in sorted_words[first:last] if timed.end <= end + WORD_BOUNDARY_TOLERANCE
    ]


def clean_subtitle_text(value: str, language: str) -> str:
    if language in UNSPACED_LANGUAGES:
        return value.strip()
    return " ".join(value.split())


def enforce_max_line_length(
    start: float,
    end: float,
    text: str,
    words: list[TimedWord],
    *,
    language: str,
    max_line_length: int,
) -> list[WhisperSegment]:
    """Splits one subtitle at whole words until every part fits the line length.

    Without word timing, each part gets a share of the time in proportion to its length.
    """
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
    groups = _group_by_length(tokens, lambda group: join_tokens(group, language), max_line_length)
    total_weight = sum(max(1, len(join_tokens(group, language))) for group in groups)
    elapsed = start
    remaining = max(0.0, end - elapsed)
    output: list[WhisperSegment] = []
    for index, group in enumerate(groups):
        group_text = join_tokens(group, language)
        share = max(1, len(group_text)) / total_weight
        group_end = end if index == len(groups) - 1 else elapsed + remaining * share
        output.append(_segment(elapsed, group_end, group_text, []))
        remaining -= group_end - elapsed
        total_weight -= max(1, len(group_text))
        elapsed = group_end
    return output


def _segment(start: float, end: float, text: str, words: list[TimedWord]) -> WhisperSegment:
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


def _join_words(words: list[TimedWord], language: str) -> str:
    return join_tokens([str(timed.word.get("word") or "").strip() for timed in words], language)


def join_tokens(tokens: list[str], language: str) -> str:
    separator = "" if language in UNSPACED_LANGUAGES else " "
    return separator.join(token for token in tokens if token).strip()
