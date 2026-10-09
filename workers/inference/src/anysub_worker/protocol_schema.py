from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic.json_schema import GenerateJsonSchema, JsonSchemaMode, models_json_schema

from .models import (
    JobCompletionReport,
    JobFailureReport,
    JobProgressReport,
    LeaseResponse,
    WorkerManifest,
)

# The worker source tree sits at workers/inference in the repository.
PROTOCOL_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2] / "../../packages/contracts/schema/protocol.schema.json"
)

# The top-level messages exchanged with the application. Validation mode describes
# what the worker accepts, serialization mode what it emits.
PROTOCOL_MESSAGES: tuple[tuple[type[BaseModel], JsonSchemaMode], ...] = (
    (WorkerManifest, "serialization"),
    (JobProgressReport, "serialization"),
    (JobFailureReport, "serialization"),
    (JobCompletionReport, "serialization"),
    (LeaseResponse, "validation"),
)


class _ProtocolJsonSchema(GenerateJsonSchema):
    # Field titles would become one named TypeScript alias per property.
    def field_title_should_be_set(self, schema: Any) -> bool:
        return False


def build_protocol_schema() -> dict[str, Any]:
    message_refs, bundle = models_json_schema(
        PROTOCOL_MESSAGES,
        by_alias=True,
        title="ProtocolMessage",
        schema_generator=_ProtocolJsonSchema,
    )
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        **bundle,
        "anyOf": [message_refs[message] for message in PROTOCOL_MESSAGES],
    }


def render_protocol_schema() -> str:
    return json.dumps(build_protocol_schema(), indent=2) + "\n"


def write_protocol_schema() -> Path:
    target = PROTOCOL_SCHEMA_PATH.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_protocol_schema(), encoding="utf-8")
    return target
