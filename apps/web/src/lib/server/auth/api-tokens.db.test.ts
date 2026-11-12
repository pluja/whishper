import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  authenticateApiToken,
  createApiToken,
  listApiTokens,
  parseNewApiToken,
  revokeAllApiTokens,
  revokeApiToken,
} from "#lib/server/auth/api-tokens.ts";
import { db } from "#lib/server/db/index.ts";
import { apiTokens } from "#lib/server/db/schema.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";

const MINUTE = 60_000;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

function newToken(userId: string, lifetimeDays: number | null = 30) {
  return createApiToken(userId, {
    name: "Backup",
    scope: "read",
    lifetimeDays,
  });
}

describe("API tokens", () => {
  it("keep only a hash, and a prefix to tell them apart", () => {
    const { userId } = seedProject();

    const token = newToken(userId);

    const row = db.select().from(apiTokens).get();
    expect(token).toMatch(/^anysub_pat_[\w-]{43}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(listApiTokens(userId)).toMatchObject([
      { name: "Backup", scope: "read", prefix: token.slice(0, 15) },
    ]);
  });

  it("authenticate their user with their scope", () => {
    const { userId } = seedProject();
    const token = newToken(userId);

    expect(authenticateApiToken(`Bearer ${token}`)).toMatchObject({
      user: { id: userId },
      scope: "read",
    });
  });

  it.each([
    [null],
    ["anysub_pat_abc"],
    ["Basic dXNlcjpwYXNz"],
    ["Bearer anysub_pat_unknown"],
    ["Bearer some-other-token"],
  ])("refuse %s", (authorization) => {
    seedProject();

    expect(authenticateApiToken(authorization)).toBeNull();
  });

  it("stop working once expired or revoked", () => {
    const { userId } = seedProject();
    const expiring = newToken(userId, 30);
    const revoked = newToken(userId);
    // Newest first, so the token made last leads the list.
    const [revokedRow] = listApiTokens(userId);
    if (!revokedRow) throw new Error("Expected two tokens");

    revokeApiToken(userId, revokedRow.id);

    const later = new Date(Date.now() + 31 * 24 * 60 * MINUTE);
    expect(authenticateApiToken(`Bearer ${expiring}`, later)).toBeNull();
    expect(authenticateApiToken(`Bearer ${revoked}`)).toBeNull();
  });

  it("can only be revoked by their owner", () => {
    const owner = seedProject();
    const other = seedProject();
    newToken(owner.userId);
    const [row] = listApiTokens(owner.userId);
    if (!row) throw new Error("Expected a token");

    revokeApiToken(other.userId, row.id);

    expect(listApiTokens(owner.userId)).toHaveLength(1);
  });

  it("record their last use at most once a minute", () => {
    const { userId } = seedProject();
    const token = newToken(userId);
    const lastUsed = () =>
      db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).get()
        ?.lastUsedAt;
    const start = new Date();

    authenticateApiToken(`Bearer ${token}`, start);
    authenticateApiToken(`Bearer ${token}`, new Date(start.getTime() + 1_000));
    expect(lastUsed()).toEqual(start);

    const later = new Date(start.getTime() + 2 * MINUTE);
    authenticateApiToken(`Bearer ${token}`, later);
    expect(lastUsed()).toEqual(later);
  });

  it("are described by a name, a scope and a lifetime", () => {
    expect(
      parseNewApiToken(
        form({ name: " CI ", scope: "write", lifetime: "never" }),
      ),
    ).toEqual({ name: "CI", scope: "write", lifetimeDays: null });
    expect(() =>
      parseNewApiToken(form({ name: "CI", scope: "admin", lifetime: "30" })),
    ).toThrow("may do");
    expect(() =>
      parseNewApiToken(form({ name: "", scope: "read", lifetime: "30" })),
    ).toThrow("name");
    expect(() =>
      parseNewApiToken(form({ name: "CI", scope: "read", lifetime: "7" })),
    ).toThrow("expires");
  });

  it("end all at once when the password changes", () => {
    const { userId } = seedProject();
    const token = newToken(userId);

    revokeAllApiTokens(userId);

    expect(authenticateApiToken(`Bearer ${token}`)).toBeNull();
    expect(listApiTokens(userId)).toEqual([]);
  });

  it("are limited to fifty per user", () => {
    const { userId } = seedProject();
    for (let index = 0; index < 50; index += 1) newToken(userId);

    expect(() => newToken(userId)).toThrow("50 tokens already");
  });
});
