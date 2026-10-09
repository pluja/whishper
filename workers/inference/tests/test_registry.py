import asyncio

from anysub_worker.adapter import Adapter, TranscriptionAdapter
from anysub_worker.adapters.fake import FakeAdapter
from anysub_worker.models import (
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
    TranscriptionRequest,
)
from anysub_worker.registry import AdapterRegistry


def test_registry_resolves_adapter_by_capability() -> None:
    registry = AdapterRegistry((FakeAdapter(),))

    adapter = registry.require("builtin.fake", "fake-v1", AdapterCapability.TRANSCRIBE)

    assert adapter.manifest.display_name == "Deterministic test adapter"


def test_fake_adapter_is_deterministic() -> None:
    async def run() -> str:
        adapter = FakeAdapter()

        async def progress(_: float, __: str) -> None:
            return None

        artifact = await adapter.transcribe(
            TranscriptionRequest(
                jobId="job-1",
                projectId="project-1",
                runId="run-1",
                modelId="fake-v1",
                options={"delayMs": 0},
            ),
            progress,
        )
        return artifact.cues[0].text

    assert asyncio.run(run()) == "Private subtitles, on your machine."


def test_base_protocol_does_not_require_unrelated_capabilities() -> None:
    class ManifestOnlyAdapter:
        @property
        def manifest(self) -> AdapterManifest:
            return AdapterManifest(
                id="test.align-only",
                displayName="Alignment only",
                version="1.0.0",
                models=(
                    AdapterModel(
                        id="test-model",
                        displayName="Test model",
                        capabilities=(AdapterCapability.ALIGN,),
                    ),
                ),
            )

    adapter = ManifestOnlyAdapter()

    assert isinstance(adapter, Adapter)
    assert not isinstance(adapter, TranscriptionAdapter)
    assert AdapterRegistry((adapter,)).adapters == (adapter,)
