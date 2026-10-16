import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateLeaseToken(): string {
  return randomBytes(32).toString("base64url");
}
