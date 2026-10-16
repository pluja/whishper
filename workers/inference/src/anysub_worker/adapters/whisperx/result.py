from __future__ import annotations

from typing import NotRequired, TypedDict


class WhisperWord(TypedDict):
    word: str
    start: NotRequired[float]
    end: NotRequired[float]
    score: NotRequired[float]
    speaker: NotRequired[str]


class WhisperSegment(TypedDict):
    start: float
    end: float
    text: str
    words: NotRequired[list[WhisperWord]]
