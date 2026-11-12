import { vi } from "vitest";

// Each test file imports its own module graph, so it gets a private database.
vi.mock("$app/env/private", () => ({
  ANYSUB_DATABASE_FILE: ":memory:",
  BETTER_AUTH_URL: "",
  DATA_ROOT: "",
  BETTER_AUTH_SECRET: "",
  ANYSUB_WORKER_TOKEN: "",
}));
