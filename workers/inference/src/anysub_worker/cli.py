from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from .config import WorkerSettings
from .models import AdapterManifest, TranscriptArtifact, TranscriptionRequest
from .registry import AdapterRegistry
from .runner import run_forever


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = WorkerSettings()  # type: ignore[call-arg]
    registry = AdapterRegistry.discover()
    asyncio.run(run_forever(settings, registry))


def list_adapters() -> None:
    registry = AdapterRegistry.discover()
    print(
        json.dumps(
            [
                adapter.manifest.model_dump(by_alias=True, mode="json")
                for adapter in registry.adapters
            ],
            indent=2,
        )
    )


def write_adapter_schema() -> None:
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://anysub.org/schemas/adapter-v1.json",
        "manifest": AdapterManifest.model_json_schema(by_alias=True),
        "transcriptionRequest": TranscriptionRequest.model_json_schema(by_alias=True),
        "transcriptArtifact": TranscriptArtifact.model_json_schema(by_alias=True),
    }
    target = Path("adapter-v1.schema.json")
    target.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
