import { getRequestEvent } from "$app/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";

import { db } from "$lib/server/db";
import { account, session, user, verification } from "$lib/server/db/schema";
import { privateEnv } from "$lib/server/env";

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
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  trustedOrigins: [privateEnv.authUrl],
  advanced: {
    cookiePrefix: "anysub",
  },
  plugins: [sveltekitCookies(getRequestEvent)],
});
