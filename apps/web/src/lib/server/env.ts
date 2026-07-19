import { env } from "$env/dynamic/private";

export const privateEnv = {
  databaseUrl:
    env.DATABASE_URL ??
    "postgresql://anysub:anysub-local-only@postgres:5432/anysub",
  authSecret:
    env.BETTER_AUTH_SECRET ?? "build-only-placeholder-secret-at-least-32-chars",
  authUrl: env.BETTER_AUTH_URL ?? "http://localhost:5173",
  workerToken:
    env.ANYSUB_WORKER_TOKEN ?? "local-worker-token-change-before-exposing",
  dataRoot: env.DATA_ROOT ?? "/data",
};
