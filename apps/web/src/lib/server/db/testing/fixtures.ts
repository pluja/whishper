import { randomUUID } from "node:crypto";

import type { TranscriptionJobPayload } from "@anysub/contracts";

import { pool } from "$lib/server/db";
import { hashToken } from "$lib/server/jobs/lease-token";

const seededUserIds: string[] = [];
const seededWorkspaceIds: string[] = [];

// Deleting the workspace cascades to its projects, runs, jobs, tracks and
// uploads, so every test leaves the shared database as it found it.
export async function deleteSeededRows(): Promise<void> {
  const workspaceIds = seededWorkspaceIds.splice(0);
  const userIds = seededUserIds.splice(0);
  await pool.query(`delete from workspaces where id = any($1::uuid[])`, [
    workspaceIds,
  ]);
  await pool.query(`delete from auth_users where id = any($1::text[])`, [
    userIds,
  ]);
}

export type SeededProject = {
  userId: string;
  workspaceId: string;
  projectId: string;
};

export async function seedProject(
  options: { mediaOriginalKey?: string | null } = {},
): Promise<SeededProject> {
  const userId = randomUUID();
  await pool.query(
    `insert into auth_users (id, name, email) values ($1, 'Tester', $2)`,
    [userId, `${userId}@example.test`],
  );
  seededUserIds.push(userId);
  const workspace = await pool.query<{ id: string }>(
    `insert into workspaces (name, slug) values ('Workspace', $1) returning id`,
    [`workspace-${userId}`],
  );
  const workspaceId = workspace.rows[0].id;
  seededWorkspaceIds.push(workspaceId);
  await pool.query(
    `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`,
    [workspaceId, userId],
  );
  const project = await pool.query<{ id: string }>(
    `insert into projects (workspace_id, name, created_by, media_original_key)
     values ($1, 'Project', $2, $3)
     returning id`,
    [workspaceId, userId, options.mediaOriginalKey ?? null],
  );
  return { userId, workspaceId, projectId: project.rows[0].id };
}

export type SeededTranscriptionJob = {
  jobId: string;
  runId: string;
  leaseToken: string;
};

export async function seedLeasedTranscriptionJob(
  project: SeededProject,
  lease: { attempts: number; maxAttempts: number; expiresInSeconds: number },
): Promise<SeededTranscriptionJob> {
  const run = await pool.query<{ id: string }>(
    `insert into transcription_runs
       (project_id, status, adapter_id, model_id, created_by)
     values ($1, 'running', 'fake', 'fake-model', $2)
     returning id`,
    [project.projectId, project.userId],
  );
  const runId = run.rows[0].id;
  const payload: TranscriptionJobPayload = {
    kind: "transcribe",
    adapterId: "fake",
    modelId: "fake-model",
    projectId: project.projectId,
    runId,
  };
  const leaseToken = randomUUID();
  const job = await pool.query<{ id: string }>(
    `insert into jobs
       (workspace_id, project_id, run_id, kind, state, payload, attempts,
        max_attempts, lease_token_hash, lease_expires_at)
     values ($1, $2, $3, 'transcribe', 'leased', $4, $5, $6, $7,
             now() + make_interval(secs => $8))
     returning id`,
    [
      project.workspaceId,
      project.projectId,
      runId,
      JSON.stringify(payload),
      lease.attempts,
      lease.maxAttempts,
      hashToken(leaseToken),
      lease.expiresInSeconds,
    ],
  );
  return { jobId: job.rows[0].id, runId, leaseToken };
}
