import { getRequestEvent } from "$app/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";

import { db } from "$lib/server/db";
import { account, session, user, verification } from "$lib/server/auth/schema";
import { privateEnv } from "$lib/server/env";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "$lib/shared/project-limits";

export const auth = betterAuth({
  appName: "Anysub",
  baseURL: privateEnv.authUrl,
  secret: privateEnv.authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
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
