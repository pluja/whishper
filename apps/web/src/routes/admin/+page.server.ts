import { redirect } from "@sveltejs/kit";

import { ADMIN_SECTIONS } from "#lib/admin/sections.ts";
import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  redirect(307, ADMIN_SECTIONS[0].href);
};
