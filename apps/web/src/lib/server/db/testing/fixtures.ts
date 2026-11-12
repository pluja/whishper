import { randomUUID } from "node:crypto";

import type { TranscriptionJobPayload } from "@anysub/contracts";

import { user } from "#lib/server/auth/schema.ts";
import { db } from "#lib/server/db/index.ts";
import {
  jobs,
  memberships,
  projects,
  subtitleTracks,
  transcriptionRuns,
  workspaces,
} from "#lib/server/db/schema.ts";
import { hashToken } from "#lib/server/jobs/lease-token.ts";

function seedUser(): string {
  const userId = randomUUID();
  db.insert(user)
    .values({ id: userId, name: "Tester", email: `${userId}@example.test` })
    .run();
  return userId;
}

export function seedMember(
  workspaceId: string,
  role: "owner" | "admin" | "member",
): string {
  const userId = seedUser();
  db.insert(memberships).values({ workspaceId, userId, role }).run();
  return userId;
}

export type SeededProject = {
  userId: string;
  workspaceId: string;
  projectId: string;
};

export function seedProject(
  options: { mediaOriginalKey?: string | null } = {},
): SeededProject {
  const userId = seedUser();
  const workspace = db
    .insert(workspaces)
    .values({ name: "Workspace", slug: `workspace-${userId}` })
    .returning({ id: workspaces.id })
    .get();
  db.insert(memberships)
    .values({ workspaceId: workspace.id, userId, role: "owner" })
    .run();
  const project = db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: "Project",
      createdBy: userId,
      mediaOriginalKey: options.mediaOriginalKey ?? null,
    })
    .returning({ id: projects.id })
    .get();
  return { userId, workspaceId: workspace.id, projectId: project.id };
}

export function seedTrack(projectId: string): string {
  return db
    .insert(subtitleTracks)
    .values({ projectId, name: "Track", language: "en" })
    .returning({ id: subtitleTracks.id })
    .get().id;
}

export type SeededTranscriptionJob = {
  jobId: string;
  runId: string;
  leaseToken: string;
};

export function seedLeasedTranscriptionJob(
  project: SeededProject,
  lease: { attempts: number; maxAttempts: number; expiresInSeconds: number },
): SeededTranscriptionJob {
  const run = db
    .insert(transcriptionRuns)
    .values({
      projectId: project.projectId,
      status: "running",
      adapterId: "fake",
      modelId: "fake-model",
      createdBy: project.userId,
    })
    .returning({ id: transcriptionRuns.id })
    .get();
  const payload: TranscriptionJobPayload = {
    kind: "transcribe",
    adapterId: "fake",
    modelId: "fake-model",
    projectId: project.projectId,
    runId: run.id,
  };
  const leaseToken = randomUUID();
  const job = db
    .insert(jobs)
    .values({
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      runId: run.id,
      kind: "transcribe",
      state: "leased",
      payload,
      attempts: lease.attempts,
      maxAttempts: lease.maxAttempts,
      leaseTokenHash: hashToken(leaseToken),
      leaseExpiresAt: new Date(Date.now() + lease.expiresInSeconds * 1000),
    })
    .returning({ id: jobs.id })
    .get();
  return { jobId: job.id, runId: run.id, leaseToken };
}
