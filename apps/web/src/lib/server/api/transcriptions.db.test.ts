import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  cancelTranscription,
  startTranscription,
  transcriptionForUser,
} from "#lib/server/api/transcriptions.ts";
import { db } from "#lib/server/db/index.ts";
import {
  jobs,
  subtitleTracks,
  transcriptionRuns,
} from "#lib/server/db/schema.ts";
import { seedMember, seedProject } from "#lib/server/db/testing/fixtures.ts";
import {
  connectWorker,
  remoteWorker,
  seedRemoteModel,
} from "#lib/server/db/testing/remote.ts";
import { updateInstanceSettings } from "#lib/server/settings/instance.ts";
import { REMOTE_ADAPTER_ID } from "#lib/shared/transcription-models.ts";

function readyProject() {
  connectWorker(remoteWorker(true));
  const { modelId } = seedRemoteModel(6_000);
  const project = seedProject({ mediaOriginalKey: "media/source.mp4" });
  return { ...project, model: `${REMOTE_ADAPTER_ID}:${modelId}` };
}

describe("API transcriptions", () => {
  it("start with the server's defaults for options left out", () => {
    const project = readyProject();
    updateInstanceSettings({ maxLineLength: 36, language: "de" });

    const run = startTranscription(project.userId, project.projectId, {
      model: project.model,
    });

    expect(run).toMatchObject({ status: "queued", model: project.model });
    const job = db.select().from(jobs).where(eq(jobs.runId, run.id)).get();
    if (job?.payload.kind !== "transcribe") throw new Error("Expected a job");
    expect(job.payload).toMatchObject({
      language: "de",
      options: { maxLineLength: 36 },
    });
  });

  it("refuse options the model does not take", () => {
    const project = readyProject();

    expect(() =>
      startTranscription(project.userId, project.projectId, {
        model: project.model,
        alignment: true,
      }),
    ).toThrow("alignment:");
  });

  it("refuse models no connected worker offers", () => {
    const project = readyProject();

    expect(() =>
      startTranscription(project.userId, project.projectId, {
        model: "whisperx:large-v3",
      }),
    ).toThrow("No connected worker offers that model");
  });

  it("are visible to workspace members only", () => {
    const project = readyProject();
    const member = seedMember(project.workspaceId, "member");
    const stranger = seedProject();
    const run = startTranscription(member, project.projectId, {
      model: project.model,
    });

    expect(
      transcriptionForUser(project.userId, project.projectId, run.id).id,
    ).toBe(run.id);
    expect(() =>
      transcriptionForUser(stranger.userId, project.projectId, run.id),
    ).toThrow("Project not found.");
  });

  it("report their track and estimated cost once completed", () => {
    const project = readyProject();
    const run = startTranscription(project.userId, project.projectId, {
      model: project.model,
    });
    db.update(transcriptionRuns)
      .set({
        status: "completed",
        estimatedCostMicros: 15_000,
        completedAt: new Date(),
      })
      .where(eq(transcriptionRuns.id, run.id))
      .run();
    const track = db
      .insert(subtitleTracks)
      .values({
        projectId: project.projectId,
        sourceRunId: run.id,
        name: "T",
        language: "en",
      })
      .returning({ id: subtitleTracks.id })
      .get();

    expect(
      transcriptionForUser(project.userId, project.projectId, run.id),
    ).toMatchObject({
      status: "completed",
      trackId: track.id,
      estimatedCostUsd: 0.015,
    });
  });

  it("cancel only while active", () => {
    const project = readyProject();
    const run = startTranscription(project.userId, project.projectId, {
      model: project.model,
    });

    expect(
      cancelTranscription(project.userId, project.projectId, run.id).status,
    ).toBe("cancelled");
    expect(() =>
      cancelTranscription(project.userId, project.projectId, run.id),
    ).toThrow("already finished");
  });
});
