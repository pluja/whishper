import type { Queryable } from "$lib/server/db/types";

export type MemberProject = {
  id: string;
  workspaceId: string;
  name: string;
  mediaOriginalKey: string | null;
  canManage: boolean;
};

type ProjectLookup = { lock?: boolean };

const CAN_MANAGE = "(p.created_by = m.user_id or m.role in ('owner', 'admin'))";

async function findProject(
  executor: Queryable,
  projectId: string,
  userId: string,
  { lock = false, manageableOnly }: ProjectLookup & { manageableOnly: boolean },
): Promise<MemberProject | null> {
  const result = await executor.query<MemberProject>(
    `select p.id, p.workspace_id as "workspaceId", p.name,
            p.media_original_key as "mediaOriginalKey",
            ${CAN_MANAGE} as "canManage"
       from projects p
       join memberships m on m.workspace_id = p.workspace_id
      where p.id = $1 and m.user_id = $2
            ${manageableOnly ? `and ${CAN_MANAGE}` : ""}
      ${lock ? "for update of p" : ""}`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

// lock must run inside a transaction: it holds the project row until commit.
export function projectForUser(
  executor: Queryable,
  projectId: string,
  userId: string,
  options: ProjectLookup = {},
): Promise<MemberProject | null> {
  return findProject(executor, projectId, userId, {
    ...options,
    manageableOnly: false,
  });
}

// Managing covers destructive changes, open to the project's creator and to
// workspace owners and admins.
export function manageableProjectForUser(
  executor: Queryable,
  projectId: string,
  userId: string,
  options: ProjectLookup = {},
): Promise<MemberProject | null> {
  return findProject(executor, projectId, userId, {
    ...options,
    manageableOnly: true,
  });
}
