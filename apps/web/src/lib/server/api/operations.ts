import type { z } from "zod";

import {
  ApiErrorSchema,
  MeSchema,
  ModelListSchema,
  ProjectListQuerySchema,
  ProjectListSchema,
  ProjectSchema,
  ProjectUploadQuerySchema,
  TrackListSchema,
  TrackSchema,
  TranscriptionRequestSchema,
  TranscriptionSchema,
} from "#lib/server/api/schemas.ts";
import type { ApiMethod } from "#lib/shared/api-reference.ts";
import { TRACK_EXPORT_FORMATS } from "#lib/shared/routes.ts";

export type ApiResponse = {
  description: string;
  schema?: z.ZodType;
  // Set for answers that are not JSON, such as subtitle files.
  contentType?: string;
};

export type ApiOperation = {
  method: ApiMethod;
  // OpenAPI style, relative to /api/v1.
  path: string;
  operationId: string;
  tag: "Account" | "Models" | "Projects" | "Transcriptions" | "Subtitles";
  summary: string;
  description?: string;
  query?: z.ZodObject;
  body?: { schema?: z.ZodType; contentType: string; description: string };
  responses: Record<number, ApiResponse>;
  // Extra curl arguments for the reference page's example. $MODEL stands for
  // a model the server offers.
  example?: { arguments?: string[]; query?: string };
};

const projectId = "{projectId}";
const error = (description: string): ApiResponse => ({
  description,
  schema: ApiErrorSchema,
});
const notFound = error(
  "The project, or what was asked for in it, does not exist or is not yours.",
);

export const API_OPERATIONS: ApiOperation[] = [
  {
    method: "GET",
    path: "/me",
    operationId: "getMe",
    tag: "Account",
    summary: "Your account and workspaces",
    responses: { 200: { description: "You.", schema: MeSchema } },
  },
  {
    method: "GET",
    path: "/models",
    operationId: "listModels",
    tag: "Models",
    summary: "Models you can transcribe with",
    description:
      "The same choices as the transcribe form: local models on the connected workers and the external providers' models.",
    responses: {
      200: { description: "Available models.", schema: ModelListSchema },
    },
  },
  {
    method: "GET",
    path: "/projects",
    operationId: "listProjects",
    tag: "Projects",
    summary: "List projects",
    description: "Projects in all your workspaces, newest first.",
    query: ProjectListQuerySchema,
    responses: {
      200: { description: "One page of projects.", schema: ProjectListSchema },
      400: error("The query is invalid."),
    },
  },
  {
    method: "POST",
    path: "/projects",
    operationId: "createProject",
    tag: "Projects",
    summary: "Create a project from a file",
    description:
      "Send the media file as the raw request body, up to the server's request limit. Use the resumable upload at /api/uploads for larger files. Media preparation starts on its own.",
    query: ProjectUploadQuerySchema,
    body: {
      contentType: "application/octet-stream",
      description:
        "The file itself. Send its media type, such as video/mp4, or application/octet-stream.",
    },
    example: {
      arguments: ['-H "Content-Type: video/mp4"', "--data-binary @talk.mp4"],
      query: "filename=talk.mp4",
    },
    responses: {
      201: { description: "The new project.", schema: ProjectSchema },
      400: error("The query or the body is invalid."),
      404: error("The workspace does not exist or is not yours."),
      413: error("The file is larger than the upload limit."),
    },
  },
  {
    method: "GET",
    path: `/projects/${projectId}`,
    operationId: "getProject",
    tag: "Projects",
    summary: "Get a project",
    responses: {
      200: { description: "The project.", schema: ProjectSchema },
      404: notFound,
    },
  },
  {
    method: "DELETE",
    path: `/projects/${projectId}`,
    operationId: "deleteProject",
    tag: "Projects",
    summary: "Delete a project",
    description:
      "Deletes the project, its media and its subtitles. Needs the project's creator or a workspace owner or admin.",
    responses: {
      204: { description: "Deleted." },
      403: error("You may not delete this project."),
      404: notFound,
    },
  },
  {
    method: "POST",
    path: `/projects/${projectId}/transcriptions`,
    operationId: "startTranscription",
    tag: "Transcriptions",
    summary: "Start a transcription",
    description:
      "Options left out take the server's defaults. Options the model does not accept are refused.",
    body: {
      schema: TranscriptionRequestSchema,
      contentType: "application/json",
      description: "The model and its options.",
    },
    example: {
      arguments: [
        '-H "Content-Type: application/json"',
        `-d '{"model": "$MODEL"}'`,
      ],
    },
    responses: {
      202: { description: "The queued run.", schema: TranscriptionSchema },
      400: error("The model or an option is invalid."),
      404: notFound,
      409: error("The upload has not finished, or a run is already active."),
    },
  },
  {
    method: "GET",
    path: `/projects/${projectId}/transcriptions/{transcriptionId}`,
    operationId: "getTranscription",
    tag: "Transcriptions",
    summary: "Get a transcription's status",
    description: "Poll this every few seconds until the status is final.",
    responses: {
      200: { description: "The run.", schema: TranscriptionSchema },
      404: notFound,
    },
  },
  {
    method: "DELETE",
    path: `/projects/${projectId}/transcriptions/{transcriptionId}`,
    operationId: "cancelTranscription",
    tag: "Transcriptions",
    summary: "Cancel a transcription",
    responses: {
      202: { description: "The cancelled run.", schema: TranscriptionSchema },
      404: notFound,
      409: error("The run has already finished."),
    },
  },
  {
    method: "GET",
    path: `/projects/${projectId}/tracks`,
    operationId: "listTracks",
    tag: "Subtitles",
    summary: "List subtitle tracks",
    responses: {
      200: { description: "The project's tracks.", schema: TrackListSchema },
      404: notFound,
    },
  },
  {
    method: "GET",
    path: `/projects/${projectId}/tracks/{trackId}`,
    operationId: "getTrack",
    tag: "Subtitles",
    summary: "Get a track with its cues",
    description: "Times are in microseconds from the start of the media.",
    responses: {
      200: { description: "The track and its cues.", schema: TrackSchema },
      404: notFound,
    },
  },
  {
    method: "GET",
    path: `/projects/${projectId}/tracks/{trackId}/export/{format}`,
    operationId: "exportTrack",
    tag: "Subtitles",
    summary: "Download a track as a subtitle file",
    description: `Formats: ${TRACK_EXPORT_FORMATS.join(", ")}. The same files as Export in the studio.`,
    example: { arguments: ["-o subtitles.srt"] },
    responses: {
      200: {
        description: "The subtitle file, as an attachment.",
        contentType: "application/octet-stream",
      },
      404: notFound,
    },
  },
];
