import type { ApiTokenScope } from "#lib/shared/api-tokens.ts";

export type ApiMethod = "GET" | "POST" | "DELETE";

export type ReferenceParameter = {
  name: string;
  location: "path" | "query";
  required: boolean;
  description: string | null;
  type: string;
};

export type ReferenceOperation = {
  id: string;
  tag: string;
  method: ApiMethod;
  path: string;
  summary: string;
  description: string | null;
  scope: ApiTokenScope;
  parameters: ReferenceParameter[];
  body: {
    contentType: string;
    description: string;
    schema: string | null;
  } | null;
  responses: { status: number; description: string; schema: string | null }[];
  curl: string;
};

export type ReferencePage = {
  version: string;
  operations: ReferenceOperation[];
  schemas: { name: string; json: string }[];
};
