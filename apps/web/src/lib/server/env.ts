import { env } from "$env/dynamic/private";

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024 * 1024;

const MINIMUM_AUTH_SECRET_LENGTH = 32;
const MINIMUM_WORKER_TOKEN_LENGTH = 24;

// Published in this repository through .env.example, an older Compose default,
// or the build-time fallback below. Anyone who reads the source can forge
// sessions or impersonate a worker against a server that keeps one.
const PUBLISHED_PLACEHOLDERS = new Set([
  "anysub-local-only",
  "build-only-placeholder-secret-at-least-32-chars",
  "change-this-database-password",
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
  databaseUrl:
    env.DATABASE_URL ??
    "postgresql://anysub:anysub-local-only@postgres:5432/anysub",
  authSecret:
    env.BETTER_AUTH_SECRET ?? "build-only-placeholder-secret-at-least-32-chars",
  authUrl: env.BETTER_AUTH_URL || "http://localhost:5173",
  workerToken:
    env.ANYSUB_WORKER_TOKEN ?? "local-worker-token-change-before-exposing",
  dataRoot: env.DATA_ROOT ?? "/data",
  maxUploadBytes: positiveInteger(
    env.ANYSUB_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_BYTES,
  ),
};

export type RuntimeSecrets = {
  authSecret: string;
  workerToken: string;
  databaseUrl: string;
};

function databasePassword(databaseUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(databaseUrl).password) || null;
  } catch {
    return null;
  }
}

// Messages name the variable and the problem, never the value, so callers can
// log them.
export function findInsecureSettings(secrets: RuntimeSecrets): string[] {
  const problems: string[] = [];

  const named: {
    name: string;
    value: string;
    minimumLength: number;
    purpose: string;
  }[] = [
    {
      name: "BETTER_AUTH_SECRET",
      value: secrets.authSecret,
      minimumLength: MINIMUM_AUTH_SECRET_LENGTH,
      purpose: "signs session cookies",
    },
    {
      name: "ANYSUB_WORKER_TOKEN",
      value: secrets.workerToken,
      minimumLength: MINIMUM_WORKER_TOKEN_LENGTH,
      purpose: "authenticates workers against the job API",
    },
  ];

  for (const { name, value, minimumLength, purpose } of named) {
    if (value.length === 0) {
      problems.push(`${name} is not set. It ${purpose}.`);
    } else if (PUBLISHED_PLACEHOLDERS.has(value)) {
      problems.push(
        `${name} is still a placeholder published in this repository. It ${purpose}.`,
      );
    } else if (value.length < minimumLength) {
      problems.push(
        `${name} is shorter than ${minimumLength} characters. It ${purpose}.`,
      );
    }
  }

  const password = databasePassword(secrets.databaseUrl);
  if (password && PUBLISHED_PLACEHOLDERS.has(password)) {
    problems.push(
      "DATABASE_URL still carries a placeholder password published in this repository.",
    );
  }

  return problems;
}

export function insecureSettingsReport(problems: string[]): string {
  return [
    "Anysub found insecure credentials:",
    ...problems.map((problem) => `  - ${problem}`),
    "Run scripts/init-env.sh to generate a .env with unique secrets.",
  ].join("\n");
}

// Development warns rather than throws so a bare `vite dev` outside Compose
// still runs.
export function assertSecureRuntimeConfiguration(options: {
  dev: boolean;
}): void {
  const problems = findInsecureSettings(privateEnv);
  if (problems.length === 0) return;

  const report = insecureSettingsReport(problems);
  if (options.dev) {
    console.warn(`${report}\nContinuing because this is a development server.`);
    return;
  }

  throw new Error(report);
}
