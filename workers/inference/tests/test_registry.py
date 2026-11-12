import pytest
from fakes import FakeAdapter

from anysub_worker.adapter import Adapter, TranscriptionAdapter
from anysub_worker.adapters.whisperx import adapter as whisperx_adapter
from anysub_worker.models import (
    REMOTE_ADAPTER_ID,
    AdapterCapability,
    AdapterManifest,
    AdapterModel,
)
from anysub_worker.registry import AdapterLoadError, AdapterRegistry


def test_registry_resolves_adapter_by_capability() -> None:
    registry = AdapterRegistry((FakeAdapter(),))

    adapter = registry.require("builtin.fake", "fake-v1", AdapterCapability.TRANSCRIBE)

    assert adapter.manifest.display_name == "Deterministic test adapter"


def test_discovery_registers_only_production_adapters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(whisperx_adapter, "find_spec", lambda name: object())

    assert [adapter.manifest.id for adapter in AdapterRegistry.discover().adapters] == ["whisperx"]


def test_discovery_skips_whisperx_without_its_library(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(whisperx_adapter, "find_spec", lambda name: None)

    assert AdapterRegistry.discover().adapters == ()


def test_registry_reserves_the_remote_adapter_id() -> None:
    class RemoteImpostor(FakeAdapter):
        @property
        def manifest(self) -> AdapterManifest:
            return super().manifest.model_copy(update={"id": REMOTE_ADAPTER_ID})

    with pytest.raises(AdapterLoadError, match="reserved"):
        AdapterRegistry((RemoteImpostor(),))


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
