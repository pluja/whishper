from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ADAPTER_PROTOCOL_VERSION = "1.0"
WORKER_PROTOCOL_VERSION = "1.0"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AdapterCapability(StrEnum):
    TRANSCRIBE = "transcribe"
    ALIGN = "align"
    DIARIZE = "diarize"
    TRANSLATE = "translate"


class AdapterModel(StrictModel):
    id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._/-]*$")
    display_name: str = Field(alias="displayName", min_length=1)
    capabilities: tuple[AdapterCapability, ...]
    languages: tuple[str, ...] | Literal["all"] = "all"
    description: str | None = None
    options_schema: dict[str, Any] = Field(default_factory=dict, alias="optionsSchema")


class AdapterManifest(StrictModel):
    protocol_version: Literal["1.0"] = Field(
        default=ADAPTER_PROTOCOL_VERSION, alias="protocolVersion"
    )
    id: str = Field(min_length=1, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    display_name: str = Field(alias="displayName", min_length=1)
    version: str = Field(min_length=1)
    description: str | None = None
    models: tuple[AdapterModel, ...]

    @model_validator(mode="after")
    def model_ids_are_unique(self) -> AdapterManifest:
        ids = [model.id for model in self.models]
        if len(ids) != len(set(ids)):
            raise ValueError("adapter model IDs must be unique")
        return self

    def supports(self, capability: AdapterCapability, model_id: str) -> bool:
        return any(
            model.id == model_id and capability in model.capabilities for model in self.models
        )


class TranscriptionRequest(StrictModel):
    job_id: str = Field(alias="jobId")
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    model_id: str = Field(alias="modelId")
    media_path: str | None = Field(default=None, alias="mediaPath")
    language: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class WordToken(StrictModel):
    id: str
    text: str
    start_us: Annotated[int, Field(ge=0)] = Field(alias="startUs")
    end_us: Annotated[int, Field(ge=0)] = Field(alias="endUs")
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None
    speaker: str | None = None

    @model_validator(mode="after")
    def timing_is_ordered(self) -> WordToken:
        if self.end_us < self.start_us:
            raise ValueError("word endUs must not precede startUs")
        return self


class TranscriptCue(StrictModel):
    id: str
    start_us: Annotated[int, Field(ge=0)] = Field(alias="startUs")
    end_us: Annotated[int, Field(ge=0)] = Field(alias="endUs")
    text: str
    words: tuple[WordToken, ...] = ()

    @model_validator(mode="after")
    def timing_contains_words(self) -> TranscriptCue:
        if self.end_us < self.start_us:
            raise ValueError("cue endUs must not precede startUs")
        if any(word.start_us < self.start_us or word.end_us > self.end_us for word in self.words):
            raise ValueError("word timing must be contained by its cue")
        return self


class TranscriptArtifact(StrictModel):
    schema_version: Literal["1.0"] = Field(default="1.0", alias="schemaVersion")
    language: str
    duration_us: Annotated[int, Field(ge=0)] = Field(alias="durationUs")
    cues: tuple[TranscriptCue, ...]
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def cues_fit_duration(self) -> TranscriptArtifact:
        if any(cue.end_us > self.duration_us for cue in self.cues):
            raise ValueError("cue timing must fit within artifact duration")
        return self


class TranscriptionJobPayload(StrictModel):
    kind: Literal["transcribe"]
    adapter_id: str = Field(alias="adapterId")
    model_id: str = Field(alias="modelId")
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    media_path: str | None = Field(default=None, alias="mediaPath")
    language: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class WorkerLease(StrictModel):
    job_id: str = Field(alias="jobId")
    attempt: int = Field(ge=1)
    lease_token: str = Field(alias="leaseToken")
    lease_expires_at: str = Field(alias="leaseExpiresAt")
    payload: TranscriptionJobPayload


class LeaseResponse(StrictModel):
    lease: WorkerLease | None
    poll_after_ms: int = Field(default=2_000, alias="pollAfterMs", ge=100)


class JobCompletion(StrictModel):
    artifact: TranscriptArtifact
    adapter: dict[str, str]


class JobFailure(StrictModel):
    code: str
    message: str
    retryable: bool
