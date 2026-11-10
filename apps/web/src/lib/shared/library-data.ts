import type {
  JobState,
  ProbeState,
  RunStatus,
  UploadStatus,
} from "./project-status";

export type LibrarySearch = {
  query: string;
  includeSubtitles: boolean;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  projectCount: number;
  readySourceCount: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: Date;
  activityAt: Date;
  runStatus: RunStatus | null;
  jobState: JobState | null;
  progress: number | null;
  progressMessage: string | null;
  uploadStatus: UploadStatus | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  receivedBytes: number | null;
  mediaDurationUs: number | null;
  mediaPreparationStatus: ProbeState;
  mediaType: string | null;
  hasThumbnail: boolean;
  trackCount: number;
  cueCount: number;
  languages: string[];
  subtitleMatch: boolean;
  videoWidth: string | null;
  videoHeight: string | null;
};

export type LibraryData = {
  workspace: WorkspaceSummary | null;
  projects: ProjectSummary[];
  search: LibrarySearch;
};
