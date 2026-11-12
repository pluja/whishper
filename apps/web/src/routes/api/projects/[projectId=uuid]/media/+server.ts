import { projectForUser } from "#lib/server/projects/access.ts";
import { requireUser } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { safeMediaType, streamMediaFile } from "#lib/server/media/stream.ts";
import { resolveDataPath } from "#lib/server/storage/paths.ts";
import { uploadMediaType } from "#lib/server/uploads/projects.ts";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const project = projectForUser(db, params.projectId, user.id);
  if (!project?.mediaOriginalKey) error(404, "Media not found");

  const response = await streamMediaFile(
    resolveDataPath(project.mediaOriginalKey),
    safeMediaType(uploadMediaType(project.id)),
    request,
  );
  if (!response) error(404, "Media not found");
  return response;
};

// Without its own export, SvelteKit answers HEAD by reading the whole file.
export const HEAD = GET;
