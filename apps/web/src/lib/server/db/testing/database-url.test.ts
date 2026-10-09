import { afterEach, describe, expect, it, vi } from "vitest";

import { assertTestDatabaseUrl, testDatabaseUrl } from "./database-url";

const HOST = "postgresql://user:secret@postgres:5432";

describe("assertTestDatabaseUrl", () => {
  it.each(["anysub_test", "anysub_test_migration_0a1b2c"])(
    "accepts the test database %s",
    (name) => {
      expect(assertTestDatabaseUrl(`${HOST}/${name}`)).toBe(`${HOST}/${name}`);
    },
  );

  it.each(["anysub", "anysub_testing", "postgres", "test_anysub_test", ""])(
    "refuses the database %j",
    (name) => {
      expect(() => assertTestDatabaseUrl(`${HOST}/${name}`)).toThrow(
        "Refusing to run database tests",
      );
    },
  );

  it("refuses a value that is not a URL", () => {
    expect(() => assertTestDatabaseUrl("anysub_test")).toThrow(
      "not a valid URL",
    );
  });
});

describe("testDatabaseUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires ANYSUB_TEST_DATABASE_URL", () => {
    vi.stubEnv("ANYSUB_TEST_DATABASE_URL", "");
    expect(() => testDatabaseUrl()).toThrow("Set ANYSUB_TEST_DATABASE_URL");
  });

  it("guards the configured URL", () => {
    vi.stubEnv("ANYSUB_TEST_DATABASE_URL", `${HOST}/anysub`);
    expect(() => testDatabaseUrl()).toThrow("Refusing to run database tests");
  });
});
