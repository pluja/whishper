import type { WorkerStorageSpace } from "$lib/shared/model-inventory";

export type StoredFiles = { bytes: number; count: number };

export type StorageUsage = {
  // The disk that holds uploads and previews. Null when it cannot be read.
  volume: WorkerStorageSpace | null;
  originals: StoredFiles;
  previews: StoredFiles;
  uploading: StoredFiles;
  databaseBytes: number;
};
