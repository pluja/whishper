from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from anysub_worker.models import WorkerDevice
from anysub_worker.options import MAX_LINE_LENGTH, BooleanOption, ChoiceOption, IntegerOption

BATCH_SIZE_BY_DEVICE: dict[WorkerDevice, int] = {"cpu": 4, "cuda": 16}

# CTranslate2 cannot run half-precision floats on a CPU, so lower memory there
# means the same int8 weights as the automatic choice.
COMPUTE_TYPES: dict[str, dict[WorkerDevice, str]] = {
    "auto": {"cpu": "int8", "cuda": "float16"},
    "memory": {"cpu": "int8", "cuda": "int8_float16"},
    "precise": {"cpu": "float32", "cuda": "float32"},
}


ALIGNMENT = BooleanOption(
    name="alignment", default=True, description="Refine segments to word-level timestamps."
)
BATCH_SIZE = IntegerOption(
    name="batchSize",
    minimum=1,
    maximum=64,
    description="Inference batch size. Lower this if memory is limited.",
)
PRECISION = ChoiceOption(
    name="precision",
    choices=tuple(COMPUTE_TYPES),
    default="auto",
    description="Model weight precision. Lower precision runs faster and uses less memory.",
)
OPTIONS = (ALIGNMENT, BATCH_SIZE, MAX_LINE_LENGTH, PRECISION)


@dataclass(frozen=True)
class TranscriptionOptions:
    alignment: bool
    batch_size: int
    max_line_length: int
    compute_type: str


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
        compute_type=COMPUTE_TYPES[PRECISION.parse(options)][device],
    )
