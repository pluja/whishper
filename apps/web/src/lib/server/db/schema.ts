import type { WorkerJobPayload, WorkerManifest } from "@anysub/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { user } from "../auth/schema";
import {
  createdAt,
  flag,
  json,
  timestamp,
  timestampDefaultNow,
  updatedAt,
  uuidPrimaryKey,
} from "./columns";

type JsonObject = Record<string, unknown>;

// Worker failures plus the ones the application raises itself, such as an
// expired lease, which are not part of the worker protocol.
export type StoredJobError = {
  code: string;
  message: string;
  retryable: boolean;
};

export const instanceSecrets = sqliteTable("instance_secrets", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
});

export const workspaces = sqliteTable("workspaces", {
  id: uuidPrimaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("memberships_user_id_idx").on(table.userId),
    check(
      "memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'member')`,
    ),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: uuidPrimaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mediaOriginalKey: text("media_original_key"),
    mediaFilename: text("media_filename"),
    mediaDurationUs: integer("media_duration_us"),
    mediaPreparationStatus: text("media_preparation_status", {
      enum: ["not_started", "queued", "running", "completed", "failed"],
    })
      .notNull()
      .default("not_started"),
    mediaProbe: json<JsonObject>("media_probe"),
    mediaFrameRateNum: integer("media_frame_rate_num"),
    mediaFrameRateDen: integer("media_frame_rate_den"),
    mediaSeekable: flag("media_seekable"),
    mediaProxyRecommended: flag("media_proxy_recommended"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("projects_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    check(
      "projects_media_duration_check",
      sql`${table.mediaDurationUs} is null or ${table.mediaDurationUs} >= 0`,
    ),
    check(
      "projects_media_preparation_status_check",
      sql`${table.mediaPreparationStatus} in ('not_started', 'queued', 'running', 'completed', 'failed')`,
    ),
    check(
      "projects_media_frame_rate_check",
      sql`(${table.mediaFrameRateNum} is null and ${table.mediaFrameRateDen} is null)
        or (${table.mediaFrameRateNum} > 0 and ${table.mediaFrameRateDen} > 0)`,
    ),
  ],
);

export const transcriptionRuns = sqliteTable(
  "transcription_runs",
  {
    id: uuidPrimaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    adapterId: text("adapter_id").notNull(),
    modelId: text("model_id").notNull(),
    options: json<JsonObject>("options").notNull().default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("transcription_runs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    check(
      "transcription_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  architecture: text("architecture").notNull(),
  protocolVersion: text("protocol_version").notNull(),
  manifest: json<WorkerManifest>("manifest").notNull(),
  lastSeenAt: timestampDefaultNow("last_seen_at"),
  createdAt: createdAt(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: uuidPrimaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    runId: text("run_id").references(() => transcriptionRuns.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: ["transcribe", "media_prepare"] }).notNull(),
    state: text("state", {
      enum: ["queued", "leased", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    priority: integer("priority").notNull().default(0),
    payload: json<WorkerJobPayload>("payload").notNull(),
    result: json<unknown>("result"),
    error: json<StoredJobError>("error"),
    progress: real("progress").notNull().default(0),
    progressMessage: text("progress_message"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestampDefaultNow("available_at"),
    leasedBy: text("leased_by").references(() => workers.id, {
      onDelete: "set null",
    }),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("jobs_lease_idx").on(
      table.state,
      table.availableAt,
      table.priority,
      table.createdAt,
    ),
    index("jobs_run_idx").on(table.runId),
    index("jobs_project_idx").on(table.projectId, table.kind, table.state),
    check(
      "jobs_state_check",
      sql`${table.state} in ('queued', 'leased', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "jobs_progress_check",
      sql`${table.progress} >= 0 and ${table.progress} <= 1`,
    ),
  ],
);

export const subtitleTracks = sqliteTable(
  "subtitle_tracks",
  {
    id: uuidPrimaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceRunId: text("source_run_id").references(() => transcriptionRuns.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    kind: text("kind").notNull().default("transcription"),
    metadata: json<JsonObject>("metadata").notNull().default({}),
    revision: integer("revision").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("subtitle_tracks_project_idx").on(table.projectId),
    check("subtitle_tracks_revision_check", sql`${table.revision} >= 0`),
  ],
);

export const cues = sqliteTable(
  "cues",
  {
    id: uuidPrimaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => subtitleTracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startUs: integer("start_us").notNull(),
    endUs: integer("end_us").notNull(),
    text: text("text").notNull(),
    words: json<JsonObject[]>("words").notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("cues_track_position_idx").on(table.trackId, table.position),
    check(
      "cues_timing_check",
      sql`${table.startUs} >= 0 and ${table.endUs} >= ${table.startUs}`,
    ),
  ],
);

export const mediaUploads = sqliteTable(
  "media_uploads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type"),
    sizeBytes: integer("size_bytes").notNull(),
    receivedBytes: integer("received_bytes").notNull().default(0),
    status: text("status", {
      enum: ["uploading", "finalizing", "completed", "cancelled", "failed"],
    })
      .notNull()
      .default("uploading"),
    storageKey: text("storage_key"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at"),
    firstFinalizeAttemptAt: timestamp("first_finalize_attempt_at"),
  },
  (table) => [
    index("media_uploads_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("media_uploads_status_idx").on(table.status, table.updatedAt),
    check("media_uploads_size_check", sql`${table.sizeBytes} > 0`),
    check(
      "media_uploads_received_check",
      sql`${table.receivedBytes} >= 0 and ${table.receivedBytes} <= ${table.sizeBytes}`,
    ),
    check(
      "media_uploads_status_check",
      sql`${table.status} in ('uploading', 'finalizing', 'completed', 'cancelled', 'failed')`,
    ),
  ],
);

export const mediaDerivatives = sqliteTable(
  "media_derivatives",
  {
    id: uuidPrimaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["waveform", "thumbnail", "proxy"] }).notNull(),
    status: text("status", { enum: ["ready", "failed", "deleting"] })
      .notNull()
      .default("ready"),
    storageKey: text("storage_key").notNull(),
    sourceStorageKey: text("source_storage_key").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    schemaVersion: text("schema_version").notNull(),
    generatorVersion: text("generator_version").notNull(),
    metadata: json<JsonObject>("metadata").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("media_derivatives_project_kind_unique").on(
      table.projectId,
      table.kind,
    ),
    index("media_derivatives_project_created_idx").on(
      table.projectId,
      sql`${table.createdAt} desc`,
    ),
    check(
      "media_derivatives_kind_check",
      sql`${table.kind} in ('waveform', 'thumbnail', 'proxy')`,
    ),
    check(
      "media_derivatives_status_check",
      sql`${table.status} in ('ready', 'failed', 'deleting')`,
    ),
    check("media_derivatives_size_check", sql`${table.sizeBytes} > 0`),
  ],
);
