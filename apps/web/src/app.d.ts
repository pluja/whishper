import type { auth } from "#lib/server/auth/auth.ts";
import type { ApiTokenScope } from "#lib/shared/api-tokens.ts";

declare global {
  namespace App {
    interface Locals {
      session: typeof auth.$Infer.Session.session | null;
      user: typeof auth.$Infer.Session.user | null;
      // Set when an API token, not a browser session, authenticated the request.
      apiScope: ApiTokenScope | null;
    }
  }
}

export {};
