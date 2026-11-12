from __future__ import annotations

import logging
from importlib.metadata import EntryPoint, entry_points
from typing import Any

from .adapter import Adapter, AdapterLibraryMissing
from .errors import JobError
from .models import REMOTE_ADAPTER_ID, AdapterCapability

ENTRYPOINT_GROUP = "anysub.adapters"
LOGGER = logging.getLogger(__name__)


class AdapterLoadError(JobError):
    code = "adapter_unavailable"

    def __init__(self, message: str) -> None:
        super().__init__(message, retryable=False)


class AdapterRegistry:
    def __init__(self, adapters: tuple[Adapter, ...]) -> None:
        by_id: dict[str, Adapter] = {}
        for adapter in adapters:
            adapter_id = adapter.manifest.id
            if adapter_id == REMOTE_ADAPTER_ID:
                raise AdapterLoadError(f"the adapter ID {REMOTE_ADAPTER_ID} is reserved")
            if adapter_id in by_id:
                raise AdapterLoadError(f"duplicate adapter ID: {adapter_id}")
            by_id[adapter_id] = adapter
        self._by_id = by_id

    @classmethod
    def discover(cls) -> AdapterRegistry:
        loaded = (_load_entry_point(ep) for ep in entry_points(group=ENTRYPOINT_GROUP))
        return cls(tuple(adapter for adapter in loaded if adapter is not None))

    @property
    def adapters(self) -> tuple[Adapter, ...]:
        return tuple(self._by_id[key] for key in sorted(self._by_id))

    def require(self, adapter_id: str, model_id: str, capability: AdapterCapability) -> Adapter:
        adapter = self.require_model(adapter_id, model_id)
        if not adapter.manifest.supports(capability, model_id):
            raise AdapterLoadError(
                f"adapter {adapter_id} model {model_id} does not support {capability.value}"
            )
        return adapter

    def require_model(self, adapter_id: str, model_id: str) -> Adapter:
        adapter = self._by_id.get(adapter_id)
        if adapter is None:
            raise AdapterLoadError(f"adapter is not installed: {adapter_id}")
        if all(model.id != model_id for model in adapter.manifest.models):
            raise AdapterLoadError(f"adapter {adapter_id} has no model {model_id}")
        return adapter


def _load_entry_point(entry_point: EntryPoint) -> Adapter | None:
    try:
        loaded: Any = entry_point.load()
        # Third-party adapters rely on a no-argument constructor, so every adapter,
        # the built-in one included, reads its own runtime settings.
        try:
            candidate: Any = loaded() if isinstance(loaded, type) else loaded
        except AdapterLibraryMissing as missing:
            LOGGER.info("skipping adapter %s: %s", entry_point.name, missing)
            return None
        if not isinstance(candidate, Adapter):
            raise TypeError("entry point does not implement the Adapter protocol")
        _ = candidate.manifest
        return candidate
    except Exception as exc:
        raise AdapterLoadError(
            f"could not load adapter entry point {entry_point.name}: {exc}"
        ) from exc
