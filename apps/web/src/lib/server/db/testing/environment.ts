import { vi } from "vitest";

// Each test file imports its own module graph, so it gets a private database.
vi.mock("$env/dynamic/private", () => ({
  env: { ANYSUB_DATABASE_FILE: ":memory:" },
}));
