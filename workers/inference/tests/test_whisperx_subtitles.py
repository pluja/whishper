import sys
from types import SimpleNamespace
from typing import Any

import pytest

from anysub_worker.adapters.whisperx.subtitles import split_subtitle_segments
from anysub_worker.transcripts.segments import WhisperWord


def install_processor(monkeypatch: pytest.MonkeyPatch, processor: type) -> None:
    monkeypatch.setitem(
        sys.modules, "whisperx.SubtitlesProcessor", SimpleNamespace(SubtitlesProcessor=processor)
    )


def test_subtitle_splitting_preserves_words_in_their_new_cues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeProcessor:
        def __init__(self, segments: list[dict[str, Any]], lang: str, max_line_length: int):
            assert lang == "en"
            assert max_line_length == 10

        def process_segments(self, advanced_splitting: bool) -> list[dict[str, Any]]:
            assert advanced_splitting is True
            return [
                {"start": 0.0, "end": 2.0, "text": " A  short second cue. "},
            ]

    install_processor(monkeypatch, FakeProcessor)
    result = split_subtitle_segments(
        [
            {
                "start": 0.0,
                "end": 2.0,
                "text": "A short second cue.",
                "words": [
                    {"word": "A", "start": 0.0, "end": 0.2},
                    {"word": "short", "start": 0.3, "end": 0.9},
                    {"word": "second", "start": 1.0, "end": 1.5},
                    {"word": "cue.", "start": 1.6, "end": 2.0},
                ],
            }
        ],
        language="en",
        max_line_length=10,
    )

    assert [cue["text"] for cue in result] == ["A short", "second", "cue."]
    assert [[word["word"] for word in cue.get("words", [])] for cue in result] == [
        ["A", "short"],
        ["second"],
        ["cue."],
    ]


def test_cues_without_words_split_their_text_by_length(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeProcessor:
        def __init__(self, segments: list[dict[str, Any]], lang: str, max_line_length: int):
            assert "words" not in segments[0]

        def process_segments(self, advanced_splitting: bool) -> list[dict[str, Any]]:
            return [{"start": 0.0, "end": 4.0, "text": "one two three four"}]

    install_processor(monkeypatch, FakeProcessor)
    result = split_subtitle_segments(
        [{"start": 0.0, "end": 4.0, "text": "one two three four", "words": []}],
        language="en",
        max_line_length=9,
    )

    assert [(cue["text"], cue["start"], cue["end"]) for cue in result] == [
        ("one two", 0.0, 1.75),
        ("three", 1.75, 3.0),
        ("four", 3.0, 4.0),
    ]
    assert all("words" not in cue for cue in result)


def reference_word_assignment(
    timed_words: list[WhisperWord], subtitles: list[tuple[float, float]]
) -> list[list[str]]:
    return [
        [
            word["word"]
            for word in timed_words
            if word.get("start", -1) >= start - 1e-6 and word.get("end", -1) <= end + 1e-6
        ]
        for start, end in subtitles
    ]


def test_word_assignment_matches_the_previous_quadratic_behaviour(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    words: list[WhisperWord] = [
        {"word": f"w{index}", "start": index * 0.5, "end": index * 0.5 + 0.4} for index in range(40)
    ]
    words.insert(5, {"word": "untimed"})
    subtitles = [(0.0, 2.4), (2.5, 2.5), (2.4999999, 7.9), (8.0, 20.0), (19.5, 30.0)]

    class FixtureProcessor:
        def __init__(self, segments: list[dict[str, Any]], lang: str, max_line_length: int):
            pass

        def process_segments(self, advanced_splitting: bool) -> list[dict[str, Any]]:
            return [{"start": start, "end": end, "text": "x"} for start, end in subtitles]

    install_processor(monkeypatch, FixtureProcessor)
    result = split_subtitle_segments(
        [{"start": 0.0, "end": 30.0, "text": "x", "words": words}],
        language="en",
        max_line_length=500,
    )

    timed = [word for word in words if "start" in word]
    expected = reference_word_assignment(timed, subtitles)
    assert [[word["word"] for word in cue.get("words", [])] for cue in result] == expected
