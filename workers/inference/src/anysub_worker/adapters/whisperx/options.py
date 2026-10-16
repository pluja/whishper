from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from anysub_worker.adapter import AdapterExecutionError
from anysub_worker.models import WorkerDevice

BATCH_SIZE_BY_DEVICE: dict[WorkerDevice, int] = {"cpu": 4, "cuda": 16}


@dataclass(frozen=True)
class BooleanOption:
    name: str
    default: bool
    description: str

    def schema(self) -> dict[str, Any]:
        return {"type": "boolean", "default": self.default, "description": self.description}

    def parse(self, options: dict[str, Any]) -> bool:
        value = options.get(self.name, self.default)
        if not isinstance(value, bool):
            raise AdapterExecutionError(f"{self.name} must be a boolean.", retryable=False)
        return value


@dataclass(frozen=True)
class IntegerOption:
    name: str
    minimum: int
    maximum: int
    description: str
    # Left out of the schema when the default depends on the worker.
    default: int | None = None

    def schema(self) -> dict[str, Any]:
        schema: dict[str, Any] = {
            "type": "integer",
            "minimum": self.minimum,
            "maximum": self.maximum,
            "description": self.description,
        }
        if self.default is not None:
            schema["default"] = self.default
        return schema

    def parse(self, options: dict[str, Any], *, default: int | None = None) -> int:
        value = options.get(self.name, self.default if default is None else default)
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or not self.minimum <= value <= self.maximum
        ):
            raise AdapterExecutionError(
                f"{self.name} must be an integer between {self.minimum} and {self.maximum}.",
                retryable=False,
            )
        return value


ALIGNMENT = BooleanOption(
    name="alignment", default=True, description="Refine segments to word-level timestamps."
)
BATCH_SIZE = IntegerOption(
    name="batchSize",
    minimum=1,
    maximum=64,
    description="Inference batch size. Lower this if memory is limited.",
)
MAX_LINE_LENGTH = IntegerOption(
    name="maxLineLength",
    minimum=20,
    maximum=120,
    default=42,
    description="Maximum subtitle cue length in characters.",
)
OPTIONS = (ALIGNMENT, BATCH_SIZE, MAX_LINE_LENGTH)


@dataclass(frozen=True)
class TranscriptionOptions:
    alignment: bool
    batch_size: int
    max_line_length: int


def options_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {option.name: option.schema() for option in OPTIONS},
        "additionalProperties": False,
    }


def parse_options(options: dict[str, Any], *, device: WorkerDevice) -> TranscriptionOptions:
    return TranscriptionOptions(
        alignment=ALIGNMENT.parse(options),
        batch_size=BATCH_SIZE.parse(options, default=BATCH_SIZE_BY_DEVICE[device]),
        max_line_length=MAX_LINE_LENGTH.parse(options),
    )
