import sys
from types import SimpleNamespace

from anysub_worker.adapters.whisperx import (
    WhisperXAdapter,
    _normalize_result,
    _split_subtitle_segments,
)
from anysub_worker.config import WorkerSettings


def test_manifest_exposes_accurate_models_without_importing_ml_dependencies() -> None:
    manifest = WhisperXAdapter().manifest

    assert manifest.id == "whisperx"
    assert {model.id for model in manifest.models} >= {"small", "large-v3-turbo"}
    assert all("align" in model.capabilities for model in manifest.models)
    assert manifest.models[0].options_schema["properties"]["maxLineLength"]["default"] == 42


def test_normalizes_aligned_segments_to_contract_microseconds() -> None:
    artifact = _normalize_result(
        {
            "segments": [
                {
                    "start": 0.25,
                    "end": 1.5,
                    "text": " Hello world. ",
                    "words": [
                        {"word": " Hello", "start": 0.25, "end": 0.7, "score": 1.2},
                        {"word": "world.", "start": 0.8, "end": 1.5, "score": 0.91},
                        {"word": "untimed"},
                    ],
                }
            ]
        },
        language="en",
        duration_us=1_000_000,
        metadata={"alignment": True},
    )

    assert artifact.duration_us == 1_500_000
    assert artifact.cues[0].text == "Hello world."
    assert artifact.cues[0].start_us == 250_000
    assert artifact.cues[0].words[0].text == "Hello"
    assert artifact.cues[0].words[0].confidence == 1
    assert len(artifact.cues[0].words) == 2


async def test_explicit_language_is_part_of_the_cached_model_key(tmp_path) -> None:  # type: ignore[no-untyped-def]
    class RecordingWhisperX:
        def __init__(self) -> None:
            self.languages: list[str | None] = []

        def load_model(self, model_id, device, **kwargs):  # type: ignore[no-untyped-def]
            self.languages.append(kwargs.get("language"))
            return object()

    whisperx = RecordingWhisperX()
    adapter = WhisperXAdapter(
        WorkerSettings(
            worker_token="test-worker-token",
            data_root=tmp_path,
            model_root=tmp_path,
        )
    )

    english = await adapter._load_model(whisperx, "small", "en")
    assert await adapter._load_model(whisperx, "small", "en") is english
    await adapter._load_model(whisperx, "small", "es")

    assert whisperx.languages == ["en", "es"]


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
    result = _split_subtitle_segments(
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
