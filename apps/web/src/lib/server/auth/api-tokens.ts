import { randomBytes } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { user } from "#lib/server/auth/schema.ts";
import { db } from "#lib/server/db/index.ts";
import { apiTokens } from "#lib/server/db/schema.ts";
import { badRequest, conflict } from "#lib/server/http/errors.ts";
import { hashToken } from "#lib/server/jobs/lease-token.ts";
import type { SessionUser } from "#lib/server/auth/session.ts";
import {
  API_TOKEN_LIFETIMES,
  API_TOKEN_SCOPES,
  API_TOKEN_NAME_MAX_LENGTH,
  type ApiTokenScope,
  type ApiTokenSummary,
} from "#lib/shared/api-tokens.ts";

// The prefix lets secret scanners recognize a leaked token.
const TOKEN_PREFIX = "anysub_pat_";
const SHOWN_PREFIX_LENGTH = TOKEN_PREFIX.length + 4;
const DAY_MS = 86_400_000;
// Busy scripts would otherwise write to the database on every request.
const LAST_USED_RESOLUTION_MS = 60_000;
const MAX_TOKENS_PER_USER = 50;

export type NewApiToken = {
  name: string;
  scope: ApiTokenScope;
  lifetimeDays: number | null;
};

export type ApiCaller = { user: SessionUser; scope: ApiTokenScope };

export function parseNewApiToken(form: FormData): NewApiToken {
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > API_TOKEN_NAME_MAX_LENGTH) {
    throw badRequest(
      `Give the token a name of up to ${API_TOKEN_NAME_MAX_LENGTH} characters.`,
    );
  }
  const scope = API_TOKEN_SCOPES.find((value) => value === form.get("scope"));
  if (!scope) throw badRequest("Choose what the token may do.");
  const lifetime = API_TOKEN_LIFETIMES.find(
    (choice) => String(choice.days ?? "never") === form.get("lifetime"),
  );
  if (!lifetime) throw badRequest("Choose when the token expires.");
  return { name, scope, lifetimeDays: lifetime.days };
}

// The token itself is returned only here; afterwards only its hash exists.
export function createApiToken(userId: string, input: NewApiToken): string {
  if (listApiTokens(userId).length >= MAX_TOKENS_PER_USER) {
    throw conflict(
      `You have ${MAX_TOKENS_PER_USER} tokens already. Revoke one you no longer use.`,
    );
  }
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  db.insert(apiTokens)
    .values({
      userId,
      name: input.name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, SHOWN_PREFIX_LENGTH),
      scope: input.scope,
      expiresAt:
        input.lifetimeDays === null
          ? null
          : new Date(Date.now() + input.lifetimeDays * DAY_MS),
    })
    .run();
  return token;
}

export function listApiTokens(userId: string): ApiTokenSummary[] {
  return (
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scope: apiTokens.scope,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      // Tokens made within one millisecond keep their insertion order.
      .orderBy(desc(apiTokens.createdAt), desc(sql`rowid`))
      .all()
  );
}

export function revokeApiToken(userId: string, tokenId: string): void {
  db.delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .run();
}

// Changing or resetting the password ends all access the old one gave.
export function revokeAllApiTokens(userId: string): void {
  db.delete(apiTokens).where(eq(apiTokens.userId, userId)).run();
}

// Null for anything but a current token: missing, malformed, unknown,
// revoked or expired.
export function authenticateApiToken(
  authorization: string | null,
  now = new Date(),
): ApiCaller | null {
  const token = /^Bearer (\S+)$/.exec(authorization ?? "")?.[1];
  if (!token?.startsWith(TOKEN_PREFIX)) return null;
  const row = db
    .select({ token: apiTokens, user })
    .from(apiTokens)
    .innerJoin(user, eq(user.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .get();
  if (!row) return null;
  if (row.token.expiresAt && row.token.expiresAt <= now) return null;
  const lastUsed = row.token.lastUsedAt?.getTime() ?? 0;
  if (now.getTime() - lastUsed >= LAST_USED_RESOLUTION_MS) {
    db.update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, row.token.id))
      .run();
  }
  return { user: row.user, scope: row.token.scope };
}
