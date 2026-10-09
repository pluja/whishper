import { error, redirect } from "@sveltejs/kit";

import { pool } from "$lib/server/db";

type Queryable = Pick<typeof pool, "query">;

type SessionUser = NonNullable<App.Locals["user"]>;

export type MemberProject = {
  id: string;
  workspace_id: string;
  name: string;
  media_original_key: string | null;
};

export function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) error(401, "Authentication required");
  return locals.user;
}

export function requireUserOrLogin(locals: App.Locals): SessionUser {
  if (!locals.user) redirect(303, "/login");
  return locals.user;
}

// lock must run inside a transaction: it holds the project row until commit.
export async function projectForUser(
  projectId: string | undefined,
  userId: string,
  {
    executor = pool,
    lock = false,
  }: { executor?: Queryable; lock?: boolean } = {},
): Promise<MemberProject | null> {
  if (!projectId) return null;
  const result = await executor.query<MemberProject>(
    `select p.id, p.workspace_id, p.name, p.media_original_key
       from projects p
       join memberships m on m.workspace_id = p.workspace_id
      where p.id = $1 and m.user_id = $2
      ${lock ? "for update of p" : ""}`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}
