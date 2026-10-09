from __future__ import annotations

import asyncio
import json
import logging

from .config import WorkerSettings
from .protocol_schema import write_protocol_schema
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


def export_protocol_schema() -> None:
    print(write_protocol_schema())


if __name__ == "__main__":
    main()
