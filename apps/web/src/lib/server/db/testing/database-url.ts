export function testDatabaseUrl(): string {
  const url = process.env.ANYSUB_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set ANYSUB_TEST_DATABASE_URL to a disposable database to run the database tests.",
    );
  }
  return url;
}
