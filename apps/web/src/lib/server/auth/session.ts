import { error, redirect } from "@sveltejs/kit";

type SessionUser = NonNullable<App.Locals["user"]>;

export function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) error(401, "Authentication required");
  return locals.user;
}

export function requireUserOrLogin(locals: App.Locals): SessionUser {
  if (!locals.user) redirect(303, "/login");
  return locals.user;
}
