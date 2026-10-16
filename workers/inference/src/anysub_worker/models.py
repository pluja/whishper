from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

type AdapterProtocolVersion = Literal["1.0"]
type WorkerProtocolVersion = Literal["1.0"]
type MediaPreparationVersion = Literal["1.0"]
type TranscriptSchemaVersion = Literal["1.0"]

ADAPTER_PROTOCOL_VERSION: Final[AdapterProtocolVersion] = "1.0"
WORKER_PROTOCOL_VERSION: Final[WorkerProtocolVersion] = "1.0"
MEDIA_PREPARATION_VERSION: Final[MediaPreparationVersion] = "1.0"
TRANSCRIPT_SCHEMA_VERSION: Final[TranscriptSchemaVersion] = "1.0"


# Defaulted fields count as required in the serialization schema because the
# worker always emits them, which is what the application receives.
class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        json_schema_serialization_defaults_required=True,
    )


# Application messages may gain fields before deployed workers are upgraded.
class InboundModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


MAX_WIRE_INTEGER: Final = 2**53 - 1

# Integers cross into JavaScript, which loses precision beyond 2**53 - 1.
WireInt = Annotated[int, Field(ge=-MAX_WIRE_INTEGER, le=MAX_WIRE_INTEGER)]
NonNegativeWireInt = Annotated[int, Field(ge=0, le=MAX_WIRE_INTEGER)]
PositiveWireInt = Annotated[int, Field(gt=0, le=MAX_WIRE_INTEGER)]

# A pattern, not format: uuid, so the generated standalone validators need no format plugin.
UuidString = Annotated[
    str,
    Field(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"),
]


class AdapterCapability(StrEnum):
    TRANSCRIBE = "transcribe"
    ALIGN = "align"


class AdapterModel(StrictModel):
    id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._/-]*$")
    display_name: str = Field(alias="displayName", min_length=1)
    capabilities: tuple[AdapterCapability, ...]
    languages: tuple[str, ...] | Literal["all"] = "all"
    description: str | None = None
    parameter_count: PositiveWireInt | None = Field(default=None, alias="parameterCount")
    required_vram_bytes: PositiveWireInt | None = Field(default=None, alias="requiredVramBytes")
    recommended_ram_bytes: PositiveWireInt | None = Field(default=None, alias="recommendedRamBytes")
    downloaded: bool | None = None
    options_schema: dict[str, Any] = Field(default_factory=dict, alias="optionsSchema")


class AdapterManifest(StrictModel):
    protocol_version: AdapterProtocolVersion = Field(
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


class WorkerCpu(StrictModel):
    model: str | None = None
    logical_cores: PositiveWireInt = Field(alias="logicalCores")


class WorkerMemory(StrictModel):
    total_bytes: PositiveWireInt = Field(alias="totalBytes")
    available_bytes: NonNegativeWireInt = Field(alias="availableBytes")

    @model_validator(mode="after")
    def available_does_not_exceed_total(self) -> WorkerMemory:
        if self.available_bytes > self.total_bytes:
            raise ValueError("available worker memory cannot exceed total memory")
        return self


class WorkerGpu(StrictModel):
    name: str = Field(min_length=1)
    backend: Literal["cuda", "rocm"]
    total_memory_bytes: PositiveWireInt = Field(alias="totalMemoryBytes")


class WorkerHardware(StrictModel):
    device: Literal["cpu", "cuda"]
    compute_type: str = Field(alias="computeType", min_length=1)
    cpu: WorkerCpu
    memory: WorkerMemory
    gpus: tuple[WorkerGpu, ...] = ()


class WorkerCapabilities(StrictModel):
    media_preparation: MediaPreparationVersion | None = Field(
        default=None, alias="mediaPreparation"
    )


class WorkerManifest(StrictModel):
    protocol_version: WorkerProtocolVersion = Field(
        default=WORKER_PROTOCOL_VERSION, alias="protocolVersion"
    )
    worker_id: UuidString = Field(alias="workerId")
    name: str = Field(min_length=1)
    version: str = Field(min_length=1)
    architecture: str
    capabilities: WorkerCapabilities = Field(default_factory=WorkerCapabilities)
    adapters: tuple[AdapterManifest, ...] = ()
    hardware: WorkerHardware | None = None


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
    start_us: NonNegativeWireInt = Field(alias="startUs")
    end_us: NonNegativeWireInt = Field(alias="endUs")
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None
    speaker: str | None = None

    @model_validator(mode="after")
    def timing_is_ordered(self) -> WordToken:
        if self.end_us < self.start_us:
            raise ValueError("word endUs must not precede startUs")
        return self


class TranscriptCue(StrictModel):
    id: str
    start_us: NonNegativeWireInt = Field(alias="startUs")
    end_us: NonNegativeWireInt = Field(alias="endUs")
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
    schema_version: TranscriptSchemaVersion = Field(
        default=TRANSCRIPT_SCHEMA_VERSION, alias="schemaVersion"
    )
    language: str = Field(min_length=1)
    duration_us: NonNegativeWireInt = Field(alias="durationUs")
    cues: tuple[TranscriptCue, ...]
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def cues_fit_duration(self) -> TranscriptArtifact:
        if any(cue.end_us > self.duration_us for cue in self.cues):
            raise ValueError("cue timing must fit within artifact duration")
        return self


class MediaRational(StrictModel):
    numerator: PositiveWireInt
    denominator: PositiveWireInt


class MediaAudioDetails(StrictModel):
    sample_rate: PositiveWireInt | None = Field(default=None, alias="sampleRate")
    channels: PositiveWireInt | None = None
    channel_layout: str | None = Field(default=None, alias="channelLayout")


class MediaVideoDetails(StrictModel):
    width: PositiveWireInt
    height: PositiveWireInt
    pixel_format: str | None = Field(default=None, alias="pixelFormat")
    frame_rate: MediaRational | None = Field(default=None, alias="frameRate")
    average_frame_rate: MediaRational | None = Field(default=None, alias="averageFrameRate")
    attached_picture: bool = Field(default=False, alias="attachedPicture")


class MediaProbeStream(StrictModel):
    index: NonNegativeWireInt
    type: Literal["audio", "video", "subtitle", "data", "attachment", "unknown"]
    codec: str
    duration_us: NonNegativeWireInt | None = Field(default=None, alias="durationUs")
    bit_rate: NonNegativeWireInt | None = Field(default=None, alias="bitRate")
    audio: MediaAudioDetails | None = None
    video: MediaVideoDetails | None = None


class MediaProbeArtifact(StrictModel):
    schema_version: MediaPreparationVersion = Field(
        default=MEDIA_PREPARATION_VERSION, alias="schemaVersion"
    )
    duration_us: NonNegativeWireInt = Field(alias="durationUs")
    start_us: WireInt | None = Field(default=None, alias="startUs")
    format_names: tuple[str, ...] = Field(alias="formatNames")
    format_long_name: str | None = Field(default=None, alias="formatLongName")
    bit_rate: NonNegativeWireInt | None = Field(default=None, alias="bitRate")
    seekable: bool
    frame_rate_mode: Literal["constant", "variable", "unknown"] = Field(alias="frameRateMode")
    proxy_recommended: bool = Field(alias="proxyRecommended")
    proxy_reasons: tuple[str, ...] = Field(alias="proxyReasons")
    streams: tuple[MediaProbeStream, ...]


class MediaDerivativeUpload(StrictModel):
    kind: Literal["waveform", "thumbnail", "proxy"]
    media_type: str = Field(alias="mediaType")
    size_bytes: PositiveWireInt = Field(alias="sizeBytes")
    schema_version: MediaPreparationVersion = Field(
        default=MEDIA_PREPARATION_VERSION, alias="schemaVersion"
    )
    generator_version: MediaPreparationVersion = Field(
        default=MEDIA_PREPARATION_VERSION, alias="generatorVersion"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class TranscriptionJobPayload(InboundModel):
    kind: Literal["transcribe"]
    adapter_id: str = Field(alias="adapterId")
    model_id: str = Field(alias="modelId")
    project_id: str = Field(alias="projectId")
    run_id: str = Field(alias="runId")
    media_path: str | None = Field(default=None, alias="mediaPath")
    language: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class MediaPreparationJobPayload(InboundModel):
    kind: Literal["media_prepare"]
    project_id: str = Field(alias="projectId")
    source_storage_key: str = Field(alias="sourceStorageKey")
    source_filename: str = Field(alias="sourceFilename")
    source_media_type: str | None = Field(default=None, alias="sourceMediaType")


type WorkerJobPayload = TranscriptionJobPayload | MediaPreparationJobPayload


class WorkerLease(InboundModel):
    job_id: str = Field(alias="jobId")
    attempt: int = Field(ge=1)
    lease_token: str = Field(alias="leaseToken")
    lease_expires_at: str = Field(alias="leaseExpiresAt")
    payload: WorkerJobPayload


class LeaseResponse(InboundModel):
    lease: WorkerLease | None
    poll_after_ms: int = Field(default=2_000, alias="pollAfterMs", ge=100)


class AdapterReference(StrictModel):
    id: str = Field(min_length=1)
    version: str = Field(min_length=1)
    model_id: str = Field(alias="modelId", min_length=1)


class TranscriptionJobCompletion(StrictModel):
    kind: Literal["transcribe"] = "transcribe"
    artifact: TranscriptArtifact
    adapter: AdapterReference


class MediaGenerator(StrictModel):
    id: Literal["ffmpeg"] = "ffmpeg"
    version: str


class MediaPreparationJobCompletion(StrictModel):
    kind: Literal["media_prepare"] = "media_prepare"
    probe: MediaProbeArtifact
    artifacts: tuple[MediaDerivativeUpload, ...]
    generator: MediaGenerator


type JobFailureCode = Literal["adapter_error", "adapter_unavailable", "media_preparation_error"]


class JobFailure(StrictModel):
    code: JobFailureCode
    message: str
    retryable: bool


type JobCompletion = TranscriptionJobCompletion | MediaPreparationJobCompletion


class JobProgressReport(StrictModel):
    lease_token: str = Field(alias="leaseToken", min_length=1)
    progress: float = Field(ge=0, le=1)
    message: str


class JobCompletionReport(StrictModel):
    lease_token: str = Field(alias="leaseToken", min_length=1)
    result: JobCompletion


class JobFailureReport(StrictModel):
    lease_token: str = Field(alias="leaseToken", min_length=1)
    error: JobFailure
