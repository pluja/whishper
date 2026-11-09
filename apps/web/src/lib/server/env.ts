import { env } from "$env/dynamic/private";

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024 * 1024;

const MINIMUM_AUTH_SECRET_LENGTH = 32;
const MINIMUM_WORKER_TOKEN_LENGTH = 24;

// Published in this repository's history through an old .env.example or
// Compose default. Anyone who reads the source can forge sessions or
// impersonate a worker against a server that still uses one.
const PUBLISHED_PLACEHOLDERS = new Set([
  "build-only-placeholder-secret-at-least-32-chars",
  "change-this-to-at-least-32-random-characters",
  "change-this-worker-token",
  "local-development-secret-change-before-exposing",
  "local-worker-token-change-before-exposing",
]);

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const privateEnv = {
  databaseFile: env.ANYSUB_DATABASE_FILE || "/database/anysub.db",
  authUrl: env.BETTER_AUTH_URL || "http://localhost:5173",
  dataRoot: env.DATA_ROOT ?? "/data",
  maxUploadBytes: positiveInteger(
    env.ANYSUB_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_BYTES,
  ),
  // Unset means Anysub generates the secret and keeps it in the database.
  authSecretOverride: env.BETTER_AUTH_SECRET || null,
  workerTokenOverride: env.ANYSUB_WORKER_TOKEN || null,
};

export type SecretOverrides = {
  authSecretOverride: string | null;
  workerTokenOverride: string | null;
};

// Messages name the variable and the problem, never the value, so callers can
// log them.
export function findInsecureSettings(overrides: SecretOverrides): string[] {
  const named = [
    {
      name: "BETTER_AUTH_SECRET",
      value: overrides.authSecretOverride,
      minimumLength: MINIMUM_AUTH_SECRET_LENGTH,
      purpose: "signs session cookies",
    },
    {
      name: "ANYSUB_WORKER_TOKEN",
      value: overrides.workerTokenOverride,
      minimumLength: MINIMUM_WORKER_TOKEN_LENGTH,
      purpose: "authenticates workers against the job API",
    },
  ];

  const problems: string[] = [];
  for (const { name, value, minimumLength, purpose } of named) {
    if (value === null) continue;
    if (PUBLISHED_PLACEHOLDERS.has(value)) {
      problems.push(
        `${name} is a placeholder published in this repository. It ${purpose}.`,
      );
    } else if (value.length < minimumLength) {
      problems.push(
        `${name} is shorter than ${minimumLength} characters. It ${purpose}.`,
      );
    }
  }
  return problems;
}

export function assertSecureRuntimeConfiguration(): void {
  const problems = findInsecureSettings(privateEnv);
  if (problems.length === 0) return;
  throw new Error(
    [
      "Anysub found insecure credentials:",
      ...problems.map((problem) => `  - ${problem}`),
      "Remove the variable to let Anysub generate and store a secret itself.",
    ].join("\n"),
  );
}
