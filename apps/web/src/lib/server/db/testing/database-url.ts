// The database tests reclaim every expired lease and sweep every media-less
// project, so they must never run against a database holding real data.
const TEST_DATABASE_NAME = /^anysub_test(_[a-z0-9_]+)?$/;

export function assertTestDatabaseUrl(url: string): string {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error("The test database URL is not a valid URL.");
  }
  if (!TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Refusing to run database tests against "${databaseName}". The database name must match ${TEST_DATABASE_NAME}.`,
    );
  }
  return url;
}

export function testDatabaseUrl(): string {
  const url = process.env.ANYSUB_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set ANYSUB_TEST_DATABASE_URL to a disposable database to run the database tests.",
    );
  }
  return assertTestDatabaseUrl(url);
}
