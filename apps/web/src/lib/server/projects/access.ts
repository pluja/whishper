import { and, eq, sql } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { memberships, projects } from "$lib/server/db/schema";

export type MemberProject = {
  id: string;
  workspaceId: string;
  name: string;
  mediaOriginalKey: string | null;
  canManage: boolean;
};

// Managing covers destructive changes, open to the project's creator and to
// workspace owners and admins.
const canManage = sql<boolean>`(${projects.createdBy} = ${memberships.userId} or ${memberships.role} in ('owner', 'admin'))`;

function findProject(
  executor: Executor,
  projectId: string,
  userId: string,
  manageableOnly: boolean,
): MemberProject | null {
  const project = executor
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      name: projects.name,
      mediaOriginalKey: projects.mediaOriginalKey,
      canManage: canManage.mapWith(Boolean),
    })
    .from(projects)
    .innerJoin(memberships, eq(memberships.workspaceId, projects.workspaceId))
    .where(
      and(
        eq(projects.id, projectId),
        eq(memberships.userId, userId),
        manageableOnly ? canManage : undefined,
      ),
    )
    .get();
  return project ?? null;
}

export function projectForUser(
  executor: Executor,
  projectId: string,
  userId: string,
): MemberProject | null {
  return findProject(executor, projectId, userId, false);
}

export function manageableProjectForUser(
  executor: Executor,
  projectId: string,
  userId: string,
): MemberProject | null {
  return findProject(executor, projectId, userId, true);
}
