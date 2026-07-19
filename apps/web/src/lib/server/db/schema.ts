import type { WorkerJobPayload } from "@anysub/contracts";
import {
  boolean,
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("auth_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("auth_accounts_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    check(
      "memberships_role_check",
      sql`${table.role} in ('owner', 'admin', 'member')`,
    ),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mediaOriginalKey: text("media_original_key"),
    mediaFilename: text("media_filename"),
    mediaDurationUs: bigint("media_duration_us", { mode: "number" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
  ],
);

export const transcriptionRuns = pgTable(
  "transcription_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    adapterId: text("adapter_id").notNull(),
    modelId: text("model_id").notNull(),
    options: jsonb("options")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
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

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => transcriptionRuns.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    payload: jsonb("payload").$type<WorkerJobPayload>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: jsonb("error").$type<Record<string, unknown>>(),
    progress: doublePrecision("progress").notNull().default(0),
    progressMessage: text("progress_message"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leasedBy: uuid("leased_by"),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_lease_idx").on(
      table.state,
      table.availableAt,
      table.priority,
      table.createdAt,
    ),
    index("jobs_run_idx").on(table.runId),
    check(
      "jobs_progress_check",
      sql`${table.progress} >= 0 and ${table.progress} <= 1`,
    ),
    check(
      "jobs_state_check",
      sql`${table.state} in ('queued', 'leased', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const workers = pgTable("workers", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  architecture: text("architecture").notNull(),
  protocolVersion: text("protocol_version").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subtitleTracks = pgTable(
  "subtitle_tracks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceRunId: uuid("source_run_id").references(() => transcriptionRuns.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    kind: text("kind").notNull().default("transcription"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("subtitle_tracks_project_idx").on(table.projectId)],
);

export const cues = pgTable(
  "cues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => subtitleTracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startUs: bigint("start_us", { mode: "number" }).notNull(),
    endUs: bigint("end_us", { mode: "number" }).notNull(),
    text: text("text").notNull(),
    words: jsonb("words")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("cues_track_position_idx").on(table.trackId, table.position),
    check(
      "cues_timing_check",
      sql`${table.startUs} >= 0 and ${table.endUs} >= ${table.startUs}`,
    ),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  workspaces,
  memberships,
  projects,
  transcriptionRuns,
  jobs,
  workers,
  subtitleTracks,
  cues,
};
