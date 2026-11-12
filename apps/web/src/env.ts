import { defineEnvVars } from "@sveltejs/kit/env";

// All optional: lib/server/env.ts treats an empty value as unset and applies the defaults.
export const variables = defineEnvVars({
  ANYSUB_DATABASE_FILE: { schema: (input) => input ?? "" },
  BETTER_AUTH_URL: { schema: (input) => input ?? "" },
  DATA_ROOT: { schema: (input) => input ?? "" },
  BETTER_AUTH_SECRET: { schema: (input) => input ?? "" },
  ANYSUB_WORKER_TOKEN: { schema: (input) => input ?? "" },
});
