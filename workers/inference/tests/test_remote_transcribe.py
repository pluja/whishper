from itertools import pairwise
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from anysub_worker.adapter import AdapterExecutionError, ProgressReporter
from anysub_worker.config import AdapterRuntimeSettings
from anysub_worker.models import RemoteModelAccess, TranscriptionRequest
from anysub_worker.remote import transcribe as remote_transcribe
from anysub_worker.remote.api import RemoteTranscriptionError, VerboseTranscript
from anysub_worker.remote.audio import AudioChunk
from anysub_worker.remote.transcribe import merge_chunk_transcripts, transcribe_remotely

ACCESS = RemoteModelAccess(
    providerName="OpenAI",
    baseUrl="https://api.openai.test/v1",
    apiKey=SecretStr("key"),
    model="whisper-1",
)
SECOND_US = 1_000_000


def transcript(**fields: Any) -> VerboseTranscript:
    return VerboseTranscript.model_validate(fields)


def chunk(start_seconds: int, end_seconds: int) -> AudioChunk:
    return AudioChunk(
        path=Path("unused.mp3"),
        start_us=start_seconds * SECOND_US,
        end_us=end_seconds * SECOND_US,
    )


def test_later_parts_shift_onto_the_media_timeline() -> None:
    segments = merge_chunk_transcripts(
        [chunk(0, 600), chunk(600, 900)],
        [
            transcript(segments=[{"start": 1.0, "end": 2.0, "text": " First part."}]),
            transcript(segments=[{"start": 3.0, "end": 4.5, "text": " Second part."}]),
        ],
        "en",
        42,
    )

    assert [(segment["start"], segment["end"], segment["text"]) for segment in segments] == [
        (1.0, 2.0, "First part."),
        (603.0, 604.5, "Second part."),
    ]


def test_long_segments_split_at_words_with_their_own_timing() -> None:
    words = [
        {"word": "One", "start": 0.0, "end": 0.4},
        {"word": "two", "start": 0.5, "end": 0.9},
        {"word": "three", "start": 1.0, "end": 1.4},
        {"word": "four", "start": 1.5, "end": 1.9},
    ]

    segments = merge_chunk_transcripts(
        [chunk(0, 600)],
        [transcript(segments=[{"start": 0, "end": 2, "text": "One two three four"}], words=words)],
        "en",
        15,
    )

    assert [(segment["text"], segment["start"], segment["end"]) for segment in segments] == [
        ("One two three", 0.0, 1.4),
        ("four", 1.5, 1.9),
    ]
    assert [word["word"] for word in segments[0].get("words", [])] == ["One", "two", "three"]


def test_timestamps_past_the_part_end_are_clamped() -> None:
    segments = merge_chunk_transcripts(
        [chunk(600, 610)],
        [transcript(segments=[{"start": 9.0, "end": 10.4, "text": "Late."}])],
        "en",
        42,
    )

    assert segments[0]["end"] == 610.0


def test_word_timing_without_segments_still_makes_subtitles() -> None:
    segments = merge_chunk_transcripts(
        [chunk(0, 600)],
        [
            transcript(
                words=[
                    {"word": "Only", "start": 0.2, "end": 0.5},
                    {"word": "words.", "start": 0.6, "end": 1.0},
                ]
            )
        ],
        "en",
        42,
    )

    assert [(segment["text"], segment["start"], segment["end"]) for segment in segments] == [
        ("Only words.", 0.2, 1.0)
    ]


async def test_transcribes_every_part_and_reports_the_provider(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    media = tmp_path / "projects" / "media.mp4"
    media.parent.mkdir()
    media.write_bytes(b"media")

    async def probe(source: Path) -> dict[str, Any]:
        return {"format": {"duration": "700.0"}, "streams": []}

    async def prepare(
        source: Path,
        duration_us: int,
        start_us: int,
        work_directory: Path,
        report: ProgressReporter,
    ) -> list[AudioChunk]:
        parts = []
        for index, (start, end) in enumerate([(0, 600), (600, 700)]):
            path = work_directory / f"part-{index}.mp3"
            path.write_bytes(b"audio")
            parts.append(AudioChunk(path=path, start_us=start * SECOND_US, end_us=end * SECOND_US))
        return parts

    monkeypatch.setattr(remote_transcribe, "probe_source", probe)
    monkeypatch.setattr(remote_transcribe, "prepare_audio_chunks", prepare)
    replies = iter(
        [
            {"language": "spanish", "segments": [{"start": 1, "end": 2, "text": "Hola."}]},
            {"language": "spanish", "segments": [{"start": 5, "end": 6, "text": "Adiós."}]},
        ]
    )
    progress: list[tuple[float, str]] = []

    async def report(fraction: float, message: str) -> None:
        progress.append((fraction, message))

    artifact = await transcribe_remotely(
        TranscriptionRequest(
            jobId="job",
            projectId="project",
            runId="run",
            modelId="model-row",
            mediaPath=str(media),
            options={"maxLineLength": 42},
        ),
        ACCESS,
        report,
        runtime=AdapterRuntimeSettings(data_root=tmp_path),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=next(replies))),
    )

    assert artifact.language == "es"
    assert artifact.duration_us == 700 * SECOND_US
    assert [(cue.start_us, cue.text) for cue in artifact.cues] == [
        (1 * SECOND_US, "Hola."),
        (605 * SECOND_US, "Adiós."),
    ]
    assert artifact.metadata["provider"] == "OpenAI"
    assert artifact.metadata["model"] == "whisper-1"
    assert artifact.metadata["parts"] == 2
    assert progress[-1][1] == "Building subtitle cues"
    assert all(earlier[0] <= later[0] for earlier, later in pairwise(progress))


async def test_media_outside_the_data_mount_is_refused(tmp_path: Path) -> None:
    with pytest.raises(AdapterExecutionError, match="outside the worker data mount"):
        await transcribe_remotely(
            TranscriptionRequest(
                jobId="job",
                projectId="project",
                runId="run",
                modelId="model-row",
                mediaPath="/etc/passwd",
            ),
            ACCESS,
            _ignore_progress,
            runtime=AdapterRuntimeSettings(data_root=tmp_path),
        )


async def _ignore_progress(fraction: float, message: str) -> None:
    return None


def test_split_subtitles_keep_the_segment_punctuation() -> None:
    words = [
        {"word": "Well", "start": 0.0, "end": 0.3},
        {"word": "hello", "start": 0.4, "end": 0.8},
        {"word": "there", "start": 0.9, "end": 1.2},
        {"word": "friend", "start": 1.3, "end": 1.7},
    ]

    segments = merge_chunk_transcripts(
        [chunk(0, 600)],
        [
            transcript(
                segments=[{"start": 0, "end": 2, "text": "Well, hello there, friend!"}], words=words
            )
        ],
        "en",
        20,
    )

    assert [segment["text"] for segment in segments] == ["Well, hello there,", "friend!"]
    assert segments[0]["start"] == 0.0
    assert segments[1]["start"] == 1.3


def test_unmatched_words_split_by_length_without_losing_punctuation() -> None:
    words = [
        {"word": "It", "start": 0.0, "end": 0.2},
        {"word": "costs", "start": 0.3, "end": 0.6},
        {"word": "five", "start": 0.7, "end": 1.0},
        {"word": "dollars", "start": 1.1, "end": 1.5},
    ]

    segments = merge_chunk_transcripts(
        [chunk(0, 600)],
        [
            transcript(
                segments=[{"start": 0, "end": 2, "text": "It costs $5, roughly speaking."}],
                words=words,
            )
        ],
        "en",
        20,
    )

    assert " ".join(segment["text"] for segment in segments) == "It costs $5, roughly speaking."


async def test_a_rejected_key_fails_the_job_for_good_with_its_message(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    media = tmp_path / "media.mp4"
    media.write_bytes(b"media")

    async def probe(source: Path) -> dict[str, Any]:
        return {"format": {"duration": "1300.0"}, "streams": []}

    async def prepare(
        source: Path,
        duration_us: int,
        start_us: int,
        work_directory: Path,
        report: ProgressReporter,
    ) -> list[AudioChunk]:
        parts = []
        for index in range(3):
            path = work_directory / f"part-{index}.mp3"
            path.write_bytes(b"audio")
            parts.append(AudioChunk(path=path, start_us=index, end_us=index + 1))
        return parts

    monkeypatch.setattr(remote_transcribe, "probe_source", probe)
    monkeypatch.setattr(remote_transcribe, "prepare_audio_chunks", prepare)

    with pytest.raises(RemoteTranscriptionError, match="rejected the API key") as raised:
        await transcribe_remotely(
            TranscriptionRequest(
                jobId="job",
                projectId="project",
                runId="run",
                modelId="model-row",
                mediaPath=str(media),
            ),
            ACCESS,
            _ignore_progress,
            runtime=AdapterRuntimeSettings(data_root=tmp_path),
            transport=httpx.MockTransport(
                lambda request: httpx.Response(401, json={"error": {"message": "bad key"}})
            ),
        )

    assert raised.value.retryable is False
