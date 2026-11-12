import { and, eq, sql } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { memberships, projects } from "#lib/server/db/schema.ts";
import { notFound } from "#lib/server/http/errors.ts";

export type MemberProject = {
  id: string;
  workspaceId: string;
  name: string;
  mediaOriginalKey: string | null;
  canManage: boolean;
};

// Every deletion needs manage rights, held by the project's creator and by
// workspace owners and admins. Any member may edit, rename, cancel and retry.
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

export function requireMemberProject(
  executor: Executor,
  projectId: string,
  userId: string,
): MemberProject {
  const project = projectForUser(executor, projectId, userId);
  if (!project) throw notFound("Project not found.");
  return project;
}

export function manageableProjectForUser(
  executor: Executor,
  projectId: string,
  userId: string,
): MemberProject | null {
  return findProject(executor, projectId, userId, true);
}
