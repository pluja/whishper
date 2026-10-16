from pathlib import Path

from anysub_worker.models import WORKER_PROTOCOL_VERSION, AdapterCapability
from anysub_worker.protocol_schema import (
    build_protocol_schema,
    render_protocol_schema,
    write_protocol_schema,
)

# The worker sits at workers/inference, and the dev container mounts the schema to match.
COMMITTED_SCHEMA = (
    Path(__file__).parents[1] / "../../packages/contracts/schema/protocol.schema.json"
).resolve()


def test_committed_protocol_schema_matches_the_models() -> None:
    committed = COMMITTED_SCHEMA.read_text(encoding="utf-8")

    assert committed == render_protocol_schema(), (
        "packages/contracts/schema/protocol.schema.json is stale. Run `make generate`."
    )


def test_schema_export_creates_the_target_directory(tmp_path: Path) -> None:
    target = tmp_path / "schema" / "protocol.schema.json"

    write_protocol_schema(target)

    assert target.read_text(encoding="utf-8") == render_protocol_schema()


def test_protocol_schema_publishes_version_constants() -> None:
    definitions = build_protocol_schema()["$defs"]

    assert definitions["WorkerProtocolVersion"]["const"] == WORKER_PROTOCOL_VERSION
    assert definitions["AdapterCapability"]["enum"] == [
        capability.value for capability in AdapterCapability
    ]


def test_application_messages_tolerate_unknown_fields() -> None:
    definitions = build_protocol_schema()["$defs"]

    for name in ("LeaseResponse", "WorkerLease", "TranscriptionJobPayload"):
        assert "additionalProperties" not in definitions[name]
    for name in ("WorkerManifest", "JobCompletionReport", "JobFailureReport"):
        assert definitions[name]["additionalProperties"] is False
