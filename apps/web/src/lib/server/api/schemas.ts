import { z } from "zod";

import { API_ERROR_CODES } from "#lib/server/api/errors.ts";

import {
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
} from "#lib/shared/instance-settings.ts";
import { LANGUAGE_TAG } from "#lib/shared/languages.ts";
import {
  MAX_BATCH_SIZE,
  PROJECT_TITLE_MAX_LENGTH,
} from "#lib/shared/limits.ts";
import {
  PROBE_STATES,
  RUN_STATUSES,
  UPLOAD_STATUSES,
} from "#lib/shared/project-status.ts";

// Each named schema becomes a component of the OpenAPI document.
export const apiSchemas = z.registry<{ id: string }>();

function named<Schema extends z.ZodType>(id: string, schema: Schema): Schema {
  apiSchemas.add(schema, { id });
  return schema;
}

const timestamp = z.iso.datetime().describe("ISO 8601 time, in UTC.");
const microseconds = z.number().int().min(0);

export const ApiErrorSchema = named(
  "Error",
  z.object({
    error: z.object({
      code: z.enum(API_ERROR_CODES),
      message: z.string().describe("Plain English, safe to show to people."),
    }),
  }),
);

export const TRANSCRIPTION_OPTIONS = [
  "alignment",
  "maxLineLength",
  "batchSize",
] as const;

export const ModelSchema = named(
  "Model",
  z.object({
    id: z.string().describe("Pass this as `model` to start a transcription."),
    name: z.string(),
    kind: z
      .enum(["local", "external"])
      .describe("External models send the audio to their provider."),
    provider: z.string().nullable(),
    pricePerMinuteUsd: z.number().nullable(),
    isDefault: z.boolean(),
    options: z
      .array(z.enum(TRANSCRIPTION_OPTIONS))
      .describe("The transcription options this model accepts."),
  }),
);

export const TranscriptionSchema = named(
  "Transcription",
  z.object({
    id: z.string(),
    projectId: z.string(),
    status: z.enum(RUN_STATUSES),
    model: z.string(),
    progress: z.number().min(0).max(1).nullable(),
    message: z.string().nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
    trackId: z
      .string()
      .nullable()
      .describe("The subtitle track the run made, once it completed."),
    estimatedCostUsd: z.number().nullable(),
    createdAt: timestamp,
    completedAt: timestamp.nullable(),
  }),
);

export const TrackSummarySchema = named(
  "TrackSummary",
  z.object({
    id: z.string(),
    name: z.string(),
    language: z.string(),
    cueCount: z.number().int(),
    transcriptionId: z.string().nullable(),
    createdAt: timestamp,
  }),
);

const WordSchema = named(
  "Word",
  z.object({
    text: z.string(),
    startUs: microseconds,
    endUs: microseconds,
    confidence: z.number().nullable(),
  }),
);

const CueSchema = named(
  "Cue",
  z.object({
    id: z.string(),
    startUs: microseconds,
    endUs: microseconds,
    text: z.string(),
    words: z.array(WordSchema),
  }),
);

export const TrackSchema = named(
  "Track",
  TrackSummarySchema.extend({ cues: z.array(CueSchema) }),
);

export const ProjectSummarySchema = named(
  "ProjectSummary",
  z.object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    sourceFilename: z.string().nullable(),
    durationUs: microseconds.nullable(),
    createdAt: timestamp,
    media: z.object({
      upload: z.enum(UPLOAD_STATUSES).nullable(),
      preparation: z.enum(PROBE_STATES),
      error: z.string().nullable(),
    }),
    latestTranscription: TranscriptionSchema.nullable(),
  }),
);

export const ProjectSchema = named(
  "Project",
  ProjectSummarySchema.extend({ tracks: z.array(TrackSummarySchema) }),
);

export const ProjectListSchema = named(
  "ProjectList",
  z.object({
    projects: z.array(ProjectSummarySchema),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pass as `cursor` for the next page. Null on the last page."),
  }),
);

export const ModelListSchema = named(
  "ModelList",
  z.object({ models: z.array(ModelSchema) }),
);

export const TrackListSchema = named(
  "TrackList",
  z.object({ tracks: z.array(TrackSummarySchema) }),
);

export const MeSchema = named(
  "Me",
  z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    workspaces: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          role: z.enum(["owner", "admin", "member"]),
        }),
      )
      .describe("Workspaces you belong to. Projects live in one of them."),
  }),
);

export const TranscriptionRequestSchema = named(
  "TranscriptionRequest",
  z.strictObject({
    model: z.string().min(1).describe("A model `id` from GET /models."),
    language: z
      .string()
      .regex(LANGUAGE_TAG)
      .nullable()
      .optional()
      .describe(
        "Spoken language as a language tag, such as `en`. Omit to detect it.",
      ),
    alignment: z
      .boolean()
      .optional()
      .describe("Word-level timing. Defaults to the server's setting."),
    maxLineLength: z
      .number()
      .int()
      .min(MIN_LINE_LENGTH)
      .max(MAX_LINE_LENGTH)
      .optional(),
    batchSize: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
  }),
);

export const ProjectListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const ProjectUploadQuerySchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .describe("The file's name, kept as the source file name."),
  name: z
    .string()
    .max(PROJECT_TITLE_MAX_LENGTH)
    .optional()
    .describe("Project name. Defaults to the file name without extension."),
  workspaceId: z.uuid().optional().describe("Defaults to your own workspace."),
});

export type ApiMe = z.infer<typeof MeSchema>;
export type ApiModel = z.infer<typeof ModelSchema>;
export type ApiTranscription = z.infer<typeof TranscriptionSchema>;
export type ApiTrackSummary = z.infer<typeof TrackSummarySchema>;
export type ApiTrack = z.infer<typeof TrackSchema>;
export type ApiProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type ApiProject = z.infer<typeof ProjectSchema>;
export type ApiProjectList = z.infer<typeof ProjectListSchema>;
export type ApiTranscriptionRequest = z.infer<
  typeof TranscriptionRequestSchema
>;
