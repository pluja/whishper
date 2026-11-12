import { getRequestEvent } from "$app/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";

import {
  account,
  session,
  user,
  verification,
} from "#lib/server/auth/schema.ts";
import { db } from "#lib/server/db/index.ts";
import { instanceSecret } from "#lib/server/db/secrets.ts";
import { privateEnv } from "#lib/server/env.ts";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "#lib/shared/limits.ts";

export const auth = betterAuth({
  appName: "Anysub",
  baseURL: privateEnv.authUrl,
  secret: privateEnv.authSecretOverride ?? instanceSecret("session-signing"),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
  },
  trustedOrigins: [privateEnv.authUrl],
  advanced: {
    cookiePrefix: "anysub",
  },
  plugins: [sveltekitCookies(getRequestEvent)],
});
