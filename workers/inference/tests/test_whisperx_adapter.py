import sys
from types import SimpleNamespace

import pytest

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.adapters.whisperx import WhisperXAdapter
from anysub_worker.adapters.whisperx.normalize import normalize_result
from anysub_worker.adapters.whisperx.subtitles import split_subtitle_segments
from anysub_worker.config import WorkerSettings
from anysub_worker.models import TranscriptionRequest


def test_manifest_exposes_accurate_models_without_importing_ml_dependencies(
    tmp_path,
) -> None:  # type: ignore[no-untyped-def]
    manifest = WhisperXAdapter(
        WorkerSettings(
            worker_token="test-worker-token",
            data_root=tmp_path,
            model_root=tmp_path,
        )
    ).manifest

    assert manifest.id == "whisperx"
    assert {model.id for model in manifest.models} >= {"small", "large-v3-turbo"}
    assert all("align" in model.capabilities for model in manifest.models)
    assert manifest.models[0].options_schema["properties"]["maxLineLength"]["default"] == 42
    small = next(model for model in manifest.models if model.id == "small")
    assert small.parameter_count == 244_000_000
    assert small.required_vram_bytes == 2 * 1024**3
    assert small.recommended_ram_bytes == 4 * 1024**3
    assert small.downloaded is False
    turbo = next(model for model in manifest.models if model.id == "large-v3-turbo")
    assert turbo.required_vram_bytes == 3 * 1024**3


def test_manifest_detects_complete_cached_models(tmp_path) -> None:  # type: ignore[no-untyped-def]
    snapshot = (
        tmp_path / "whisperx" / "models--Systran--faster-whisper-small" / "snapshots" / "revision"
    )
    snapshot.mkdir(parents=True)
    for filename in ("config.json", "model.bin", "tokenizer.json"):
        (snapshot / filename).touch()
    incomplete = (
        tmp_path / "whisperx" / "models--Systran--faster-whisper-tiny" / "snapshots" / "revision"
    )
    incomplete.mkdir(parents=True)
    (incomplete / "config.json").touch()

    manifest = WhisperXAdapter(
        WorkerSettings(
            worker_token="test-worker-token",
            data_root=tmp_path,
            model_root=tmp_path,
        )
    ).manifest

    downloaded = {model.id: model.downloaded for model in manifest.models}
    assert downloaded["small"] is True
    assert downloaded["tiny"] is False


def test_normalizes_aligned_segments_to_contract_microseconds() -> None:
    artifact = normalize_result(
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


def test_normalization_orders_cues_by_start_and_numbers_ids_after_sorting() -> None:
    artifact = normalize_result(
        {
            "segments": [
                {"start": 5.0, "end": 6.0, "text": "late"},
                {"start": 1.0, "end": 2.0, "text": "early"},
                {
                    "start": 3.0,
                    "end": 4.0,
                    "text": "middle",
                    "words": [
                        {"word": "middle", "start": 3.0, "end": 4.0},
                    ],
                },
            ]
        },
        language="en",
        duration_us=0,
        metadata={},
    )

    assert [cue.text for cue in artifact.cues] == ["early", "middle", "late"]
    assert [cue.id for cue in artifact.cues] == ["cue-000001", "cue-000002", "cue-000003"]
    assert artifact.cues[1].words[0].id == "word-000002-001"
    starts = [cue.start_us for cue in artifact.cues]
    assert starts == sorted(starts)


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


class StubWhisperX:
    def __init__(
        self,
        *,
        align_error: Exception | None = None,
        asr_error: Exception | None = None,
        load_error: Exception | None = None,
    ):
        self.load_error = load_error
        self.align_error = align_error
        self.asr_error = asr_error
        self.aligned = False

    def load_audio(self, path):  # type: ignore[no-untyped-def]
        return [0.0] * 16_000

    def load_model(self, model_id, device, **kwargs):  # type: ignore[no-untyped-def]
        if self.load_error:
            raise self.load_error
        outer = self

        class Model:
            def transcribe(self, audio, batch_size):  # type: ignore[no-untyped-def]
                if outer.asr_error:
                    raise outer.asr_error
                return {"language": "en", "segments": [{"start": 0.0, "end": 1.0, "text": "Hi"}]}

        return Model()

    def load_align_model(self, language_code, device, model_dir):  # type: ignore[no-untyped-def]
        if self.align_error:
            raise self.align_error
        return object(), {}

    def align(self, segments, model, metadata, audio, device, return_char_alignments):  # type: ignore[no-untyped-def]
        self.aligned = True
        return {"segments": segments}


@pytest.fixture
def transcribe_setup(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    media = tmp_path / "audio.wav"
    media.touch()
    monkeypatch.setitem(
        sys.modules,
        "whisperx.SubtitlesProcessor",
        SimpleNamespace(
            SubtitlesProcessor=lambda segments, lang, max_line_length: SimpleNamespace(
                process_segments=lambda advanced_splitting: [
                    {"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments
                ]
            )
        ),
    )
    adapter = WhisperXAdapter(
        WorkerSettings(worker_token="test-worker-token", data_root=tmp_path, model_root=tmp_path)
    )
    request = TranscriptionRequest(
        jobId="job",
        projectId="project",
        runId="run",
        mediaPath=str(media),
        modelId="small",
        language=None,
        options={},
    )

    def install(stub):  # type: ignore[no-untyped-def]
        monkeypatch.setitem(sys.modules, "whisperx", stub)
        return adapter, request

    return install


async def noop_progress(fraction, message):  # type: ignore[no-untyped-def]
    return None


async def test_alignment_failure_falls_back_to_unaligned_segments(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    adapter, request = transcribe_setup(StubWhisperX(align_error=ValueError("no aligner for xx")))

    artifact = await adapter.transcribe(request, noop_progress)

    assert [cue.text for cue in artifact.cues] == ["Hi"]
    assert artifact.metadata["alignment"] is False
    assert "no aligner for xx" in artifact.metadata["alignmentFallback"]
    assert adapter._align_model is None


async def test_successful_alignment_records_no_fallback(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    stub = StubWhisperX()
    adapter, request = transcribe_setup(stub)

    artifact = await adapter.transcribe(request, noop_progress)

    assert stub.aligned is True
    assert artifact.metadata["alignment"] is True
    assert "alignmentFallback" not in artifact.metadata


async def test_cuda_out_of_memory_is_terminal_and_releases_models(  # type: ignore[no-untyped-def]
    transcribe_setup, monkeypatch
) -> None:
    class FakeOutOfMemoryError(RuntimeError):
        pass

    monkeypatch.setitem(
        sys.modules,
        "torch",
        SimpleNamespace(
            cuda=SimpleNamespace(OutOfMemoryError=FakeOutOfMemoryError, is_available=lambda: False)
        ),
    )
    adapter, request = transcribe_setup(StubWhisperX(asr_error=FakeOutOfMemoryError("CUDA OOM")))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert "smaller model" in str(raised.value)
    assert adapter._model is None
    assert adapter._align_model is None


async def test_other_failures_release_models_and_propagate(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    adapter, request = transcribe_setup(StubWhisperX(asr_error=RuntimeError("boom")))

    with pytest.raises(RuntimeError, match="boom"):
        await adapter.transcribe(request, noop_progress)

    assert adapter._model is None


async def test_cancelled_inference_flushes_memory_when_the_thread_finishes(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import asyncio
    import threading

    from anysub_worker.adapters.whisperx import adapter as adapter_module

    flushed = asyncio.Event()
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(
        adapter_module, "_release_memory", lambda: loop.call_soon_threadsafe(flushed.set)
    )
    started = threading.Event()
    release_thread = threading.Event()

    def blocking_inference() -> None:
        started.set()
        release_thread.wait(timeout=5)

    task = asyncio.create_task(adapter_module._run_in_thread(blocking_inference))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not flushed.is_set()

    release_thread.set()
    await asyncio.wait_for(flushed.wait(), timeout=5)


def install_fake_torch(monkeypatch):  # type: ignore[no-untyped-def]
    class FakeOutOfMemoryError(RuntimeError):
        pass

    monkeypatch.setitem(
        sys.modules,
        "torch",
        SimpleNamespace(
            cuda=SimpleNamespace(OutOfMemoryError=FakeOutOfMemoryError, is_available=lambda: False)
        ),
    )
    return FakeOutOfMemoryError


async def test_out_of_memory_during_alignment_is_terminal_not_a_fallback(  # type: ignore[no-untyped-def]
    transcribe_setup, monkeypatch
) -> None:
    out_of_memory = install_fake_torch(monkeypatch)
    adapter, request = transcribe_setup(StubWhisperX(align_error=out_of_memory("CUDA OOM")))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert "smaller model" in str(raised.value)
    assert adapter._model is None
    assert adapter._align_model is None


async def test_validation_failure_keeps_the_warm_cached_model(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    adapter, request = transcribe_setup(StubWhisperX())
    await adapter.transcribe(request, noop_progress)
    warm_model = adapter._model
    assert warm_model is not None

    bad_request = request.model_copy(update={"options": {"batchSize": 0}})
    with pytest.raises(AdapterExecutionError):
        await adapter.transcribe(bad_request, noop_progress)

    assert adapter._model is warm_model


async def test_invalid_compute_type_on_model_load_is_not_retryable(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    ct2_message = "Requested float16 compute type, but the target device does not support it"
    adapter, request = transcribe_setup(StubWhisperX(load_error=ValueError(ct2_message)))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert ct2_message in str(raised.value)
    assert "ANYSUB_COMPUTE_TYPE" in str(raised.value)


async def test_download_errors_on_model_load_stay_retryable(transcribe_setup) -> None:  # type: ignore[no-untyped-def]
    adapter, request = transcribe_setup(StubWhisperX(load_error=ConnectionError("offline")))

    with pytest.raises(ConnectionError):
        await adapter.transcribe(request, noop_progress)
