export const WORKER_PROTOCOL_VERSION = "1.0";
export const ADAPTER_PROTOCOL_VERSION = "1.0";

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

export type WorkerJobPayload = TranscriptionJobPayload;

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

export interface JobCompletion {
  artifact: TranscriptArtifact;
  adapter: {
    id: string;
    version: string;
    modelId: string;
  };
}
