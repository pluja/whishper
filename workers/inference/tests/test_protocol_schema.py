from anysub_worker.models import WORKER_PROTOCOL_VERSION, AdapterCapability
from anysub_worker.protocol_schema import (
    PROTOCOL_SCHEMA_PATH,
    build_protocol_schema,
    render_protocol_schema,
)


def test_committed_protocol_schema_matches_the_models() -> None:
    committed = PROTOCOL_SCHEMA_PATH.read_text(encoding="utf-8")

    assert committed == render_protocol_schema(), (
        "packages/contracts/schema/protocol.schema.json is stale. "
        "Run `uv run anysub-protocol-schema` in workers/inference."
    )


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
