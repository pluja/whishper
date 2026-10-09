import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../../../../scripts/migrations.mjs";
import { testDatabaseUrl } from "./testing/database-url";

const scratchDatabase = `anysub_migration_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString: testDatabaseUrl() });
let scratch: pg.Client;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`create database ${scratchDatabase}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${scratchDatabase}`;
  scratch = new pg.Client({ connectionString: url.toString() });
  await scratch.connect();
});

afterAll(async () => {
  await scratch?.end();
  await admin.query(`drop database if exists ${scratchDatabase} with (force)`);
  await admin.end();
});

describe("0005_jobs_project_id", () => {
  it("backfills project ids only from payloads naming an existing project", async () => {
    await applyMigrations(scratch, { through: "0004_media_preparation.sql" });
    const seeded = await scratch.query<{ workspace_id: string; id: string }>(
      `with author as (
         insert into auth_users (id, name, email)
         values ('author', 'Author', 'author@example.test')
         returning id
       ), workspace as (
         insert into workspaces (name, slug) values ('Workspace', 'workspace')
         returning id
       )
       insert into projects (workspace_id, name, created_by)
       select workspace.id, 'Project', author.id from workspace, author
       returning workspace_id, id`,
    );
    const { workspace_id: workspaceId, id: projectId } = seeded.rows[0];
    const payloads: Record<string, unknown> = {
      lowercase: { projectId },
      uppercase: { projectId: projectId.toUpperCase() },
      missingProject: { projectId: randomUUID() },
      notUuid: { projectId: "not-a-uuid" },
      numeric: { projectId: 42 },
      absent: { kind: "transcribe" },
      array: [projectId],
      scalar: projectId,
    };
    for (const [label, payload] of Object.entries(payloads)) {
      await scratch.query(
        `insert into jobs (workspace_id, kind, payload) values ($1, $2, $3)`,
        [workspaceId, label, JSON.stringify(payload)],
      );
    }

    await applyMigrations(scratch);

    const jobs = await scratch.query<{
      kind: string;
      project_id: string | null;
    }>(`select kind, project_id from jobs`);
    const backfilled = Object.fromEntries(
      jobs.rows.map((job) => [job.kind, job.project_id]),
    );
    expect(backfilled).toEqual({
      lowercase: projectId,
      uppercase: projectId,
      missingProject: null,
      notUuid: null,
      numeric: null,
      absent: null,
      array: null,
      scalar: null,
    });
  });
});
