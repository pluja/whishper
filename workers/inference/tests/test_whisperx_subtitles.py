import sys
from types import SimpleNamespace

from anysub_worker.adapters.whisperx.subtitles import split_subtitle_segments


def test_subtitle_splitting_preserves_words_in_their_new_cues(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    class FakeProcessor:
        def __init__(self, segments, lang, max_line_length):  # type: ignore[no-untyped-def]
            assert lang == "en"
            assert max_line_length == 10

        def process_segments(self, advanced_splitting):  # type: ignore[no-untyped-def]
            assert advanced_splitting is True
            return [
                {"start": 0.0, "end": 2.0, "text": " A  short second cue. "},
            ]

    monkeypatch.setitem(
        sys.modules,
        "whisperx.SubtitlesProcessor",
        SimpleNamespace(SubtitlesProcessor=FakeProcessor),
    )
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
    assert [[word["word"] for word in cue["words"]] for cue in result] == [
        ["A", "short"],
        ["second"],
        ["cue."],
    ]


def reference_word_assignment(timed_words, subtitles):  # type: ignore[no-untyped-def]
    return [
        [
            word["word"]
            for word in timed_words
            if float(word["start"]) >= start - 1e-6 and float(word["end"]) <= end + 1e-6
        ]
        for start, end in subtitles
    ]


def test_word_assignment_matches_the_previous_quadratic_behaviour(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    words = [
        {"word": f"w{index}", "start": index * 0.5, "end": index * 0.5 + 0.4} for index in range(40)
    ]
    words.insert(5, {"word": "untimed"})
    subtitles = [(0.0, 2.4), (2.5, 2.5), (2.4999999, 7.9), (8.0, 20.0), (19.5, 30.0)]

    class FixtureProcessor:
        def __init__(self, segments, lang, max_line_length):  # type: ignore[no-untyped-def]
            pass

        def process_segments(self, advanced_splitting):  # type: ignore[no-untyped-def]
            return [{"start": start, "end": end, "text": "x"} for start, end in subtitles]

    monkeypatch.setitem(
        sys.modules,
        "whisperx.SubtitlesProcessor",
        SimpleNamespace(SubtitlesProcessor=FixtureProcessor),
    )
    result = split_subtitle_segments(
        [{"start": 0.0, "end": 30.0, "text": "x", "words": words}],
        language="en",
        max_line_length=500,
    )

    timed = [word for word in words if "start" in word]
    expected = reference_word_assignment(timed, subtitles)
    assert [[word["word"] for word in cue.get("words", [])] for cue in result] == expected
