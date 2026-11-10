import { requireAdminOrLogin } from "$lib/server/auth/session";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  return {};
};
