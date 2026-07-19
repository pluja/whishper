import { auth } from "$lib/server/auth";
import { pool } from "$lib/server/db";
import { fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

interface ProjectRow {
  id: string;
  name: string;
  created_at: Date;
  run_status: string | null;
  job_state: string | null;
  progress: number | null;
  progress_message: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const initialized = await pool.query(
    "select exists(select 1 from auth_users) as value",
  );
  if (!initialized.rows[0].value) redirect(303, "/setup");
  if (!locals.user) redirect(303, "/login");

  const workspace = await pool.query<{ id: string; name: string }>(
    `select w.id, w.name
       from workspaces w
       join memberships m on m.workspace_id = w.id
      where m.user_id = $1
      order by w.created_at asc
      limit 1`,
    [locals.user.id],
  );
  const currentWorkspace = workspace.rows[0];
  if (!currentWorkspace) {
    return { workspace: null, projects: [] as ProjectRow[] };
  }

  const projects = await pool.query<ProjectRow>(
    `select p.id, p.name, p.created_at,
            latest_run.status as run_status,
            latest_job.state as job_state,
            latest_job.progress,
            latest_job.progress_message
       from projects p
       left join lateral (
         select r.id, r.status
           from transcription_runs r
          where r.project_id = p.id
          order by r.created_at desc
          limit 1
       ) latest_run on true
       left join lateral (
         select j.state, j.progress, j.progress_message
           from jobs j
          where j.run_id = latest_run.id
          order by j.created_at desc
          limit 1
       ) latest_job on true
      where p.workspace_id = $1
      order by p.created_at desc`,
    [currentWorkspace.id],
  );

  return { workspace: currentWorkspace, projects: projects.rows };
};

export const actions: Actions = {
  createDemo: async ({ locals }) => {
    if (!locals.user) redirect(303, "/login");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const membership = await client.query<{ workspace_id: string }>(
        `select workspace_id from memberships where user_id = $1 order by created_at asc limit 1`,
        [locals.user.id],
      );
      const workspaceId = membership.rows[0]?.workspace_id;
      if (!workspaceId)
        return fail(409, { message: "Your account has no workspace." });

      const project = await client.query<{ id: string }>(
        `insert into projects (workspace_id, name, created_by)
         values ($1, 'Adapter contract demo', $2)
         returning id`,
        [workspaceId, locals.user.id],
      );
      const run = await client.query<{ id: string }>(
        `insert into transcription_runs
          (project_id, adapter_id, model_id, options, created_by)
         values ($1, 'builtin.fake', 'fake-v1', '{"delayMs": 80}'::jsonb, $2)
         returning id`,
        [project.rows[0].id, locals.user.id],
      );
      await client.query(
        `insert into jobs (workspace_id, run_id, kind, payload)
         values ($1, $2, 'transcribe', $3)`,
        [
          workspaceId,
          run.rows[0].id,
          JSON.stringify({
            kind: "transcribe",
            adapterId: "builtin.fake",
            modelId: "fake-v1",
            projectId: project.rows[0].id,
            runId: run.rows[0].id,
            language: "en",
            options: { delayMs: 80 },
          }),
        ],
      );
      await client.query("commit");
      redirect(303, `/projects/${project.rows[0].id}`);
    } catch (cause) {
      await client.query("rollback");
      if (cause && typeof cause === "object" && "status" in cause) throw cause;
      console.error("Could not create demo project", cause);
      return fail(500, {
        message: "The demo project could not be created. Try again.",
      });
    } finally {
      client.release();
    }
  },
  signOut: async ({ request }) => {
    await auth.api.signOut({ headers: request.headers });
    redirect(303, "/login");
  },
};
