export const WORKER_PROTOCOL_VERSION = "1.0";
export const ADAPTER_PROTOCOL_VERSION = "1.0";
export const MEDIA_PREPARATION_VERSION = "1.0";

export type AdapterCapability = "transcribe" | "align";

export type AdapterModel = {
  id: string;
  displayName: string;
  capabilities: AdapterCapability[];
  languages: string[] | "all";
  description?: string;
  parameterCount?: number;
  requiredVramBytes?: number;
  recommendedRamBytes?: number;
  downloaded?: boolean;
  optionsSchema?: Record<string, unknown>;
};

export type AdapterManifest = {
  protocolVersion: typeof ADAPTER_PROTOCOL_VERSION;
  id: string;
  displayName: string;
  version: string;
  description?: string;
  models: AdapterModel[];
};

export type WorkerHardware = {
  device: "cpu" | "cuda";
  computeType: string;
  cpu: {
    model?: string;
    logicalCores: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
  };
  gpus: {
    name: string;
    backend: "cuda" | "rocm";
    totalMemoryBytes: number;
  }[];
};

export type WorkerManifest = {
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  workerId: string;
  name: string;
  version: string;
  architecture: string;
  capabilities: {
    mediaPreparation?: typeof MEDIA_PREPARATION_VERSION;
  };
  adapters: AdapterManifest[];
  hardware?: WorkerHardware;
};

export type WordToken = {
  id: string;
  text: string;
  startUs: number;
  endUs: number;
  confidence?: number;
  speaker?: string;
};

export type TranscriptCue = {
  id: string;
  startUs: number;
  endUs: number;
  text: string;
  words: WordToken[];
};

export type TranscriptArtifact = {
  schemaVersion: "1.0";
  language: string;
  durationUs: number;
  cues: TranscriptCue[];
  metadata: Record<string, unknown>;
};

export type MediaRational = {
  numerator: number;
  denominator: number;
};

export type MediaProbeStream = {
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
};

export type MediaProbeArtifact = {
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
};

export type MediaDerivativeKind = "waveform" | "thumbnail" | "proxy";

export type MediaDerivativeUpload = {
  kind: MediaDerivativeKind;
  mediaType: string;
  sizeBytes: number;
  schemaVersion: typeof MEDIA_PREPARATION_VERSION;
  generatorVersion: typeof MEDIA_PREPARATION_VERSION;
  metadata: Record<string, unknown>;
};

export type TranscriptionJobPayload = {
  kind: "transcribe";
  adapterId: string;
  modelId: string;
  projectId: string;
  runId: string;
  mediaPath?: string;
  language?: string;
  options: Record<string, unknown>;
};

export type MediaPreparationJobPayload = {
  kind: "media_prepare";
  projectId: string;
  sourceStorageKey: string;
  sourceFilename: string;
  sourceMediaType?: string;
};

export type WorkerJobPayload =
  TranscriptionJobPayload | MediaPreparationJobPayload;

export type WorkerLease = {
  jobId: string;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: string;
  payload: WorkerJobPayload;
};

export type LeaseResponse = {
  lease: WorkerLease | null;
  pollAfterMs: number;
};

export type JobProgress = {
  progress: number;
  message: string;
};

export type TranscriptionJobCompletion = {
  kind: "transcribe";
  artifact: TranscriptArtifact;
  adapter: {
    id: string;
    version: string;
    modelId: string;
  };
};

export type MediaPreparationJobCompletion = {
  kind: "media_prepare";
  probe: MediaProbeArtifact;
  artifacts: MediaDerivativeUpload[];
  generator: {
    id: "ffmpeg";
    version: string;
  };
};

export type JobCompletion =
  TranscriptionJobCompletion | MediaPreparationJobCompletion;
