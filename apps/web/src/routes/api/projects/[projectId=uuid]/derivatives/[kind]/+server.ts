import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { pool } from "$lib/server/db";
import { streamMediaFile } from "$lib/server/media/stream";
import {
  derivativeMediaType,
  isMediaDerivativeKind,
  readyDerivativeFile,
} from "$lib/server/media/derivatives";
import { resolveDataPath } from "$lib/server/storage/paths";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const kind = params.kind;
  if (!kind || !isMediaDerivativeKind(kind)) error(404, "Derivative not found");

  const project = await projectForUser(pool, params.projectId, user.id);
  if (!project) error(404, "Derivative not found");

  const derivative = await readyDerivativeFile(project.id, kind);
  if (!derivative) error(404, "Derivative not found");

  const response = await streamMediaFile(
    resolveDataPath(derivative.storageKey),
    derivativeMediaType(kind, derivative.mediaType),
    request,
  );
  if (!response) error(404, "Derivative not found");
  return response;
};

// Without its own export, SvelteKit answers HEAD by reading the whole file.
export const HEAD = GET;
