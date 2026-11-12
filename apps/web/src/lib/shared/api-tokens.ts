export const API_TOKEN_SCOPES = ["read", "write"] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

// GET only reads. Everything else changes something and needs write.
export function requiredScope(method: string): ApiTokenScope {
  return method === "GET" ? "read" : "write";
}

export type ApiTokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scope: ApiTokenScope;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export const API_TOKEN_NAME_MAX_LENGTH = 60;

// Days until a new token expires; null never expires.
export const API_TOKEN_LIFETIMES: { label: string; days: number | null }[] = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
];

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  read: "Read only",
  write: "Read and write",
};
