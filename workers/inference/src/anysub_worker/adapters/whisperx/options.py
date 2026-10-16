from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from anysub_worker.adapter import AdapterExecutionError

OPTIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "alignment": {
            "type": "boolean",
            "default": True,
            "description": "Refine segments to word-level timestamps.",
        },
        "batchSize": {
            "type": "integer",
            "minimum": 1,
            "maximum": 64,
            "description": "Inference batch size. Lower this if memory is limited.",
        },
        "maxLineLength": {
            "type": "integer",
            "minimum": 20,
            "maximum": 120,
            "default": 42,
            "description": "Maximum subtitle cue length in characters.",
        },
    },
    "additionalProperties": False,
}


@dataclass(frozen=True)
class TranscriptionOptions:
    alignment: bool
    batch_size: int
    max_line_length: int


def parse_options(options: dict[str, Any], *, device: str) -> TranscriptionOptions:
    return TranscriptionOptions(
        alignment=_boolean_option(options, "alignment", True),
        batch_size=_integer_option(
            options,
            "batchSize",
            default=16 if device == "cuda" else 4,
            minimum=1,
            maximum=64,
        ),
        max_line_length=_integer_option(
            options,
            "maxLineLength",
            default=42,
            minimum=20,
            maximum=120,
        ),
    )


def _boolean_option(options: dict[str, Any], name: str, default: bool) -> bool:
    value = options.get(name, default)
    if not isinstance(value, bool):
        raise AdapterExecutionError(f"{name} must be a boolean.", retryable=False)
    return value


def _integer_option(
    options: dict[str, Any], name: str, *, default: int, minimum: int, maximum: int
) -> int:
    value = options.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise AdapterExecutionError(
            f"{name} must be an integer between {minimum} and {maximum}.", retryable=False
        )
    return value
