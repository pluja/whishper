import asyncio
import sys
import threading
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import pytest

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.adapters.whisperx import WhisperXAdapter
from anysub_worker.adapters.whisperx import adapter as adapter_module
from anysub_worker.config import WorkerSettings
from anysub_worker.models import TranscriptionRequest

type InstallStub = Callable[[object], tuple[WhisperXAdapter, TranscriptionRequest]]


def test_manifest_exposes_accurate_models_without_importing_ml_dependencies(
    settings: WorkerSettings,
) -> None:
    manifest = WhisperXAdapter(settings.runtime).manifest

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
    assert turbo.display_name == "Large v3 Turbo"
    assert turbo.required_vram_bytes == 3 * 1024**3


def test_manifest_options_schemas_are_independent(settings: WorkerSettings) -> None:
    first, second = WhisperXAdapter(settings.runtime).manifest.models[:2]

    first.options_schema["properties"]["alignment"]["default"] = False

    assert second.options_schema["properties"]["alignment"]["default"] is True


def test_manifest_detects_complete_cached_models(settings: WorkerSettings) -> None:
    model_cache = settings.runtime.model_root / "whisperx"
    snapshot = model_cache / "models--Systran--faster-whisper-small" / "snapshots" / "revision"
    snapshot.mkdir(parents=True)
    for filename in ("config.json", "model.bin", "tokenizer.json"):
        (snapshot / filename).touch()
    incomplete = model_cache / "models--Systran--faster-whisper-tiny" / "snapshots" / "revision"
    incomplete.mkdir(parents=True)
    (incomplete / "config.json").touch()

    manifest = WhisperXAdapter(settings.runtime).manifest

    downloaded = {model.id: model.downloaded for model in manifest.models}
    assert downloaded["small"] is True
    assert downloaded["tiny"] is False


async def test_explicit_language_is_part_of_the_cached_model_key(
    settings: WorkerSettings,
) -> None:
    class RecordingWhisperX:
        def __init__(self) -> None:
            self.languages: list[str | None] = []

        def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
            self.languages.append(kwargs.get("language"))
            return object()

    whisperx = RecordingWhisperX()
    adapter = WhisperXAdapter(settings.runtime)

    english = await adapter._load_model(whisperx, "small", "en")
    assert await adapter._load_model(whisperx, "small", "en") is english
    await adapter._load_model(whisperx, "small", "es")

    assert whisperx.languages == ["en", "es"]


async def test_model_load_uses_the_configured_cpu_threads(settings: WorkerSettings) -> None:
    class RecordingWhisperX:
        threads: int | None = None

        def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
            RecordingWhisperX.threads = kwargs.get("threads")
            return object()

    runtime = settings.runtime.model_copy(update={"cpu_threads": 3})
    await WhisperXAdapter(runtime)._load_model(RecordingWhisperX(), "small", None)

    assert RecordingWhisperX.threads == 3


class StubWhisperX:
    def __init__(
        self,
        *,
        align_error: Exception | None = None,
        asr_error: Exception | None = None,
        load_error: Exception | None = None,
    ) -> None:
        self.load_error = load_error
        self.align_error = align_error
        self.asr_error = asr_error
        self.aligned = False

    def load_audio(self, path: str) -> list[float]:
        return [0.0] * 16_000

    def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
        if self.load_error:
            raise self.load_error
        outer = self

        class Model:
            def transcribe(self, audio: list[float], batch_size: int) -> dict[str, Any]:
                if outer.asr_error:
                    raise outer.asr_error
                return {"language": "en", "segments": [{"start": 0.0, "end": 1.0, "text": "Hi"}]}

        return Model()

    def load_align_model(
        self, language_code: str, device: str, model_dir: str
    ) -> tuple[object, dict[str, Any]]:
        if self.align_error:
            raise self.align_error
        return object(), {}

    def align(
        self,
        segments: list[dict[str, Any]],
        model: object,
        metadata: dict[str, Any],
        audio: list[float],
        device: str,
        return_char_alignments: bool,
    ) -> dict[str, Any]:
        self.aligned = True
        return {"segments": segments}


@pytest.fixture
def transcribe_setup(settings: WorkerSettings, monkeypatch: pytest.MonkeyPatch) -> InstallStub:
    media = settings.runtime.data_root / "audio.wav"
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
    adapter = WhisperXAdapter(settings.runtime)
    request = TranscriptionRequest(
        jobId="job",
        projectId="project",
        runId="run",
        mediaPath=str(media),
        modelId="small",
        language=None,
        options={},
    )

    def install(stub: object) -> tuple[WhisperXAdapter, TranscriptionRequest]:
        monkeypatch.setitem(sys.modules, "whisperx", stub)
        return adapter, request

    return install


async def noop_progress(fraction: float, message: str) -> None:
    return None


def install_fake_torch(monkeypatch: pytest.MonkeyPatch) -> type[RuntimeError]:
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


async def test_alignment_failure_falls_back_to_unaligned_segments(
    transcribe_setup: InstallStub,
) -> None:
    adapter, request = transcribe_setup(StubWhisperX(align_error=ValueError("no aligner for xx")))

    artifact = await adapter.transcribe(request, noop_progress)

    assert [cue.text for cue in artifact.cues] == ["Hi"]
    assert artifact.metadata["alignment"] is False
    assert "no aligner for xx" in artifact.metadata["alignmentFallback"]
    assert adapter._aligner is None


async def test_successful_alignment_records_no_fallback(transcribe_setup: InstallStub) -> None:
    stub = StubWhisperX()
    adapter, request = transcribe_setup(stub)

    artifact = await adapter.transcribe(request, noop_progress)

    assert stub.aligned is True
    assert artifact.metadata["alignment"] is True
    assert "alignmentFallback" not in artifact.metadata


async def test_cuda_out_of_memory_is_terminal_and_releases_models(
    transcribe_setup: InstallStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_of_memory = install_fake_torch(monkeypatch)
    adapter, request = transcribe_setup(StubWhisperX(asr_error=out_of_memory("CUDA OOM")))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert "smaller model" in str(raised.value)
    assert adapter._model is None
    assert adapter._aligner is None


async def test_other_failures_release_models_and_propagate(transcribe_setup: InstallStub) -> None:
    adapter, request = transcribe_setup(StubWhisperX(asr_error=RuntimeError("boom")))

    with pytest.raises(RuntimeError, match="boom"):
        await adapter.transcribe(request, noop_progress)

    assert adapter._model is None


async def test_cancelled_inference_flushes_memory_when_the_thread_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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


async def test_out_of_memory_during_alignment_is_terminal_not_a_fallback(
    transcribe_setup: InstallStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    out_of_memory = install_fake_torch(monkeypatch)
    adapter, request = transcribe_setup(StubWhisperX(align_error=out_of_memory("CUDA OOM")))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert "smaller model" in str(raised.value)
    assert adapter._model is None
    assert adapter._aligner is None


async def test_validation_failure_keeps_the_warm_cached_model(
    transcribe_setup: InstallStub,
) -> None:
    adapter, request = transcribe_setup(StubWhisperX())
    await adapter.transcribe(request, noop_progress)
    warm_model = adapter._model
    assert warm_model is not None

    bad_request = request.model_copy(update={"options": {"batchSize": 0}})
    with pytest.raises(AdapterExecutionError):
        await adapter.transcribe(bad_request, noop_progress)

    assert adapter._model is warm_model


async def test_invalid_compute_type_on_model_load_is_not_retryable(
    transcribe_setup: InstallStub,
) -> None:
    ct2_message = "Requested float16 compute type, but the target device does not support it"
    adapter, request = transcribe_setup(StubWhisperX(load_error=ValueError(ct2_message)))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert ct2_message in str(raised.value)
    assert "ANYSUB_COMPUTE_TYPE" in str(raised.value)


async def test_download_errors_on_model_load_stay_retryable(transcribe_setup: InstallStub) -> None:
    adapter, request = transcribe_setup(StubWhisperX(load_error=ConnectionError("offline")))

    with pytest.raises(ConnectionError):
        await adapter.transcribe(request, noop_progress)
