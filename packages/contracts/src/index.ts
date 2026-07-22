export const WORKER_PROTOCOL_VERSION = "1.0";
export const ADAPTER_PROTOCOL_VERSION = "1.0";
export const MEDIA_PREPARATION_VERSION = "1.0";

export type AdapterCapability =
  "transcribe" | "align" | "diarize" | "translate";

export interface AdapterModel {
  id: string;
  displayName: string;
  capabilities: AdapterCapability[];
  languages: string[] | "all";
  description?: string;
  optionsSchema?: Record<string, unknown>;
}

export interface AdapterManifest {
  protocolVersion: typeof ADAPTER_PROTOCOL_VERSION;
  id: string;
  displayName: string;
  version: string;
  description?: string;
  models: AdapterModel[];
}

export interface WorkerManifest {
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  workerId: string;
  name: string;
  version: string;
  architecture: string;
  capabilities: {
    mediaPreparation?: typeof MEDIA_PREPARATION_VERSION;
  };
  adapters: AdapterManifest[];
}

export interface WordToken {
  id: string;
  text: string;
  startUs: number;
  endUs: number;
  confidence?: number;
  speaker?: string;
}

export interface TranscriptCue {
  id: string;
  startUs: number;
  endUs: number;
  text: string;
  words: WordToken[];
}

export interface TranscriptArtifact {
  schemaVersion: "1.0";
  language: string;
  durationUs: number;
  cues: TranscriptCue[];
  metadata: Record<string, unknown>;
}

export interface MediaRational {
  numerator: number;
  denominator: number;
}

export interface MediaProbeStream {
  index: number;
  type: "audio" | "video" | "subtitle" | "data" | "attachment" | "unknown";
  codec: string;
  durationUs?: number;
  bitRate?: number;
  audio?: {
    sampleRate?: number;
    channels?: number;
    channelLayout?: string;
  };
  video?: {
    width: number;
    height: number;
    pixelFormat?: string;
    frameRate?: MediaRational;
    averageFrameRate?: MediaRational;
    attachedPicture: boolean;
  };
}

export interface MediaProbeArtifact {
  schemaVersion: typeof MEDIA_PREPARATION_VERSION;
  durationUs: number;
  startUs?: number;
  formatNames: string[];
  formatLongName?: string;
  bitRate?: number;
  seekable: boolean;
  frameRateMode: "constant" | "variable" | "unknown";
  proxyRecommended: boolean;
  proxyReasons: string[];
  streams: MediaProbeStream[];
}

export type MediaDerivativeKind = "waveform" | "thumbnail" | "proxy";

export interface MediaDerivativeUpload {
  kind: MediaDerivativeKind;
  mediaType: string;
  sizeBytes: number;
  schemaVersion: typeof MEDIA_PREPARATION_VERSION;
  generatorVersion: typeof MEDIA_PREPARATION_VERSION;
  metadata: Record<string, unknown>;
}

export interface TranscriptionJobPayload {
  kind: "transcribe";
  adapterId: string;
  modelId: string;
  projectId: string;
  runId: string;
  mediaPath?: string;
  language?: string;
  options: Record<string, unknown>;
}

export interface MediaPreparationJobPayload {
  kind: "media_prepare";
  projectId: string;
  sourceStorageKey: string;
  sourceFilename: string;
  sourceMediaType?: string;
}

export type WorkerJobPayload =
  TranscriptionJobPayload | MediaPreparationJobPayload;

export interface WorkerLease {
  jobId: string;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: string;
  payload: WorkerJobPayload;
}

export interface LeaseResponse {
  lease: WorkerLease | null;
  pollAfterMs: number;
}

export interface JobProgress {
  progress: number;
  message: string;
}

export interface TranscriptionJobCompletion {
  kind: "transcribe";
  artifact: TranscriptArtifact;
  adapter: {
    id: string;
    version: string;
    modelId: string;
  };
}

export interface MediaPreparationJobCompletion {
  kind: "media_prepare";
  probe: MediaProbeArtifact;
  artifacts: MediaDerivativeUpload[];
  generator: {
    id: "ffmpeg";
    version: string;
  };
}

export type JobCompletion =
  TranscriptionJobCompletion | MediaPreparationJobCompletion;
