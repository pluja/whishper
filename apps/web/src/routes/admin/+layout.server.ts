import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import { version } from "../../../package.json";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  return { version };
};
