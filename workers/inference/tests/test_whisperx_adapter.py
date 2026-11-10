import asyncio
import sys
import threading
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from anysub_worker.adapter import AdapterExecutionError, ProgressReporter
from anysub_worker.adapters.whisperx import adapter as adapter_module
from anysub_worker.adapters.whisperx.adapter import WhisperXAdapter
from anysub_worker.adapters.whisperx.adapter import _ModelKey as ModelKey
from anysub_worker.adapters.whisperx.options import parse_options
from anysub_worker.adapters.whisperx.profiles import ModelProfile, find_profile
from anysub_worker.config import WorkerSettings
from anysub_worker.models import TranscriptionRequest, WorkerDevice

type InstallStub = Callable[[object], tuple[WhisperXAdapter, TranscriptionRequest]]


COMPLETE_SNAPSHOT = ("config.json", "model.bin", "tokenizer.json")


def write_snapshot(
    settings: WorkerSettings, model_id: str, files: tuple[str, ...] = COMPLETE_SNAPSHOT
) -> None:
    profile = find_profile(model_id)
    assert profile is not None
    model_cache = profile.cache_directory(settings.runtime.model_root / "whisperx")
    snapshot = model_cache / "snapshots" / "revision"
    snapshot.mkdir(parents=True)
    for filename in files:
        (snapshot / filename).touch()


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
    assert small.download_size_bytes == 486_212_372
    assert small.options_schema["properties"]["precision"]["enum"] == ["auto", "memory", "precise"]
    turbo = next(model for model in manifest.models if model.id == "large-v3-turbo")
    assert turbo.display_name == "Large v3 Turbo"
    assert turbo.required_vram_bytes == 3 * 1024**3


def test_manifest_options_schemas_are_independent(settings: WorkerSettings) -> None:
    first, second = WhisperXAdapter(settings.runtime).manifest.models[:2]

    first.options_schema["properties"]["alignment"]["default"] = False

    assert second.options_schema["properties"]["alignment"]["default"] is True


def test_manifest_detects_complete_cached_models(settings: WorkerSettings) -> None:
    write_snapshot(settings, "small")
    write_snapshot(settings, "tiny", ("config.json",))

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

    english = await adapter._load_model(whisperx, ModelKey("small", "en", "int8"))
    assert await adapter._load_model(whisperx, ModelKey("small", "en", "int8")) is english
    await adapter._load_model(whisperx, ModelKey("small", "es", "int8"))

    assert whisperx.languages == ["en", "es"]


async def test_precision_is_part_of_the_cached_model_key(settings: WorkerSettings) -> None:
    class RecordingWhisperX:
        def __init__(self) -> None:
            self.compute_types: list[str] = []

        def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
            self.compute_types.append(kwargs["compute_type"])
            return object()

    whisperx = RecordingWhisperX()
    adapter = WhisperXAdapter(settings.runtime)

    await adapter._load_model(whisperx, ModelKey("small", None, "int8"))
    await adapter._load_model(whisperx, ModelKey("small", None, "int8"))
    await adapter._load_model(whisperx, ModelKey("small", None, "float32"))

    assert whisperx.compute_types == ["int8", "float32"]


async def test_model_load_uses_the_configured_cpu_threads(settings: WorkerSettings) -> None:
    class RecordingWhisperX:
        threads: int | None = None

        def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
            RecordingWhisperX.threads = kwargs.get("threads")
            return object()

    runtime = settings.runtime.model_copy(update={"cpu_threads": 3})
    await WhisperXAdapter(runtime)._load_model(RecordingWhisperX(), ModelKey("small", None, "int8"))

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
    write_snapshot(settings, "small")
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
    assert "precision" in str(raised.value)


async def test_other_model_load_errors_propagate(transcribe_setup: InstallStub) -> None:
    adapter, request = transcribe_setup(StubWhisperX(load_error=ConnectionError("offline")))

    with pytest.raises(ConnectionError):
        await adapter.transcribe(request, noop_progress)


def install_fake_hub_errors(monkeypatch: pytest.MonkeyPatch) -> type[Exception]:
    class FakeLocalEntryNotFoundError(FileNotFoundError, ValueError):
        pass

    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub.errors",
        SimpleNamespace(LocalEntryNotFoundError=FakeLocalEntryNotFoundError),
    )
    return FakeLocalEntryNotFoundError


class RecordingDownloads:
    def __init__(self, settings: WorkerSettings, error: AdapterExecutionError | None = None):
        self.settings = settings
        self.error = error
        self.model_ids: list[str] = []

    async def __call__(
        self, profile: ModelProfile, model_root: Path, report_progress: ProgressReporter
    ) -> None:
        self.model_ids.append(profile.id)
        await report_progress(0.5, f"Downloading {profile.display_name}")
        if self.error is not None:
            raise self.error
        write_snapshot(self.settings, profile.id)


class RecordedProgress:
    def __init__(self) -> None:
        self.updates: list[tuple[float, str]] = []

    async def __call__(self, fraction: float, message: str) -> None:
        self.updates.append((fraction, message))


async def test_a_model_that_is_not_downloaded_downloads_before_it_loads_from_the_cache(
    settings: WorkerSettings, transcribe_setup: InstallStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    loads: list[bool] = []

    class LocalOnlyWhisperX(StubWhisperX):
        def load_model(self, model_id: str, device: str, **kwargs: Any) -> object:
            loads.append(kwargs["local_files_only"])
            return super().load_model(model_id, device, **kwargs)

    downloads = RecordingDownloads(settings)
    monkeypatch.setattr(adapter_module, "download_profile", downloads)
    adapter, request = transcribe_setup(LocalOnlyWhisperX())
    progress = RecordedProgress()

    await adapter.transcribe(request.model_copy(update={"model_id": "tiny"}), progress)
    await adapter.transcribe(request.model_copy(update={"model_id": "tiny"}), progress)

    assert downloads.model_ids == ["tiny"]
    assert loads == [True]
    assert progress.updates[0] == (0.05, "Downloading Tiny")


async def test_a_failed_model_download_stops_the_transcription_before_loading(
    settings: WorkerSettings, transcribe_setup: InstallStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    failure = AdapterExecutionError("network is unreachable", retryable=True)
    monkeypatch.setattr(adapter_module, "download_profile", RecordingDownloads(settings, failure))
    adapter, request = transcribe_setup(StubWhisperX(load_error=AssertionError("loaded")))

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request.model_copy(update={"model_id": "tiny"}), noop_progress)

    assert raised.value is failure


async def test_incomplete_cached_model_files_are_not_blamed_on_precision(
    transcribe_setup: InstallStub, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing = install_fake_hub_errors(monkeypatch)
    adapter, request = transcribe_setup(
        StubWhisperX(load_error=missing("Cannot find the requested files in the local cache"))
    )

    with pytest.raises(AdapterExecutionError) as raised:
        await adapter.transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert "Remove the model" in str(raised.value)
    assert "precision" not in str(raised.value)


@pytest.mark.parametrize(
    ("error", "device", "hardware"),
    [
        (RuntimeError("CUDA failed with error out of memory"), "cuda", "graphics card"),
        (RuntimeError("DefaultCPUAllocator: can't allocate memory"), "cpu", "worker"),
        (MemoryError(), "cpu", "worker"),
    ],
)
async def test_out_of_memory_from_any_library_is_terminal(
    settings: WorkerSettings,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    device: str,
    hardware: str,
) -> None:
    media = settings.runtime.data_root / "audio.wav"
    media.touch()
    write_snapshot(settings, "small")
    monkeypatch.setitem(sys.modules, "whisperx", StubWhisperX(asr_error=error))
    runtime = settings.runtime.model_copy(update={"device": device})
    request = TranscriptionRequest(
        jobId="job",
        projectId="project",
        runId="run",
        mediaPath=str(media),
        modelId="small",
        language=None,
        options={},
    )

    with pytest.raises(AdapterExecutionError) as raised:
        await WhisperXAdapter(runtime).transcribe(request, noop_progress)

    assert raised.value.retryable is False
    assert f"The {hardware} ran out of memory" in str(raised.value)


@pytest.mark.parametrize(
    ("precision", "device", "compute_type"),
    [
        (None, "cpu", "int8"),
        (None, "cuda", "float16"),
        ("memory", "cpu", "int8"),
        ("memory", "cuda", "int8_float16"),
        ("precise", "cpu", "float32"),
        ("precise", "cuda", "float32"),
    ],
)
def test_precision_maps_to_a_compute_type_the_device_can_run(
    precision: str | None, device: WorkerDevice, compute_type: str
) -> None:
    options = {} if precision is None else {"precision": precision}

    assert parse_options(options, device=device).compute_type == compute_type


def test_an_unknown_precision_is_rejected_permanently() -> None:
    with pytest.raises(AdapterExecutionError, match="precision must be one of") as raised:
        parse_options({"precision": "float16"}, device="cpu")

    assert raised.value.retryable is False


async def test_the_transcript_records_the_compute_type_it_ran_with(
    transcribe_setup: InstallStub,
) -> None:
    adapter, request = transcribe_setup(StubWhisperX())

    artifact = await adapter.transcribe(
        request.model_copy(update={"options": {"precision": "precise"}}), noop_progress
    )

    assert artifact.metadata["computeType"] == "float32"
