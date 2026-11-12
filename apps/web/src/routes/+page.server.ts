import { auth } from "#lib/server/auth/auth.ts";
import { requireUserOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { isInstanceInitialized } from "#lib/server/auth/instance.ts";
import {
  listLibraryProjects,
  normalizeProjectTitle,
  parseProjectLibrarySearch,
  primaryWorkspaceForUser,
  renameProjectForUser,
} from "#lib/server/projects/library.ts";
import { readInstanceSettings } from "#lib/server/settings/instance.ts";
import type { LibraryData } from "#lib/shared/library-data.ts";
import { isUuid } from "#lib/shared/uuid.ts";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals,
  url,
}): Promise<LibraryData & { maxUploadBytes: number }> => {
  if (!isInstanceInitialized()) redirect(303, "/setup");
  const user = requireUserOrLogin(locals);
  const search = parseProjectLibrarySearch(url.searchParams);

  const workspace = primaryWorkspaceForUser(db, user.id);
  const projects = workspace
    ? listLibraryProjects(db, workspace.id, search)
    : [];
  return {
    workspace,
    projects,
    search,
    maxUploadBytes: readInstanceSettings(db).maxUploadBytes,
  };
};

export const actions: Actions = {
  renameProject: async ({ locals, request, url }) => {
    const user = requireUserOrLogin(locals);
    const values = await request.formData();
    const projectId = String(values.get("projectId") ?? "");
    const name = normalizeProjectTitle(values.get("name"));
    if (!isUuid(projectId)) {
      return fail(400, {
        renameProjectId: projectId,
        renameError: "That project could not be found.",
      });
    }
    if (!name) {
      return fail(400, {
        renameProjectId: projectId,
        renameError: "Enter a project title.",
      });
    }

    try {
      if (!renameProjectForUser(db, projectId, user.id, name)) {
        return fail(404, {
          renameProjectId: projectId,
          renameError: "That project could not be found.",
        });
      }
    } catch (cause) {
      console.error("Could not rename project", cause);
      return fail(500, {
        renameProjectId: projectId,
        renameError: "The title could not be saved. Try again.",
      });
    }

    url.searchParams.delete("/renameProject");
    redirect(303, `${url.pathname}${url.search}`);
  },
  signOut: async ({ request }) => {
    await auth.api.signOut({ headers: request.headers });
    redirect(303, "/login");
  },
};
