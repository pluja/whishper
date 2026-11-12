import { z } from "zod";

import {
  API_OPERATIONS,
  type ApiOperation,
  type ApiResponse,
} from "#lib/server/api/operations.ts";
import { ApiErrorSchema, apiSchemas } from "#lib/server/api/schemas.ts";
import { requiredScope } from "#lib/shared/api-tokens.ts";
import { TRACK_EXPORT_FORMATS } from "#lib/shared/routes.ts";

const COMPONENT_REF = "#/components/schemas/";
// The API's own version, not the app's: the document is public, and the
// exact app version would help someone look up known weaknesses.
const API_VERSION = "1";

type JsonSchema = Record<string, unknown>;

export type OperationParameter = {
  name: string;
  location: "path" | "query";
  required: boolean;
  description: string | null;
  schema: JsonSchema;
};

const UNAUTHORIZED: ApiResponse = {
  description: "The token is missing, unknown or expired.",
  schema: ApiErrorSchema,
};

let cachedDocument: Record<string, unknown> | null = null;

// Built once from the same schemas that check every request, so it cannot
// drift from the code.
export function openApiDocument(): Record<string, unknown> {
  cachedDocument ??= buildDocument();
  return cachedDocument;
}

export function schemaId(schema: z.ZodType): string {
  const id = apiSchemas.get(schema)?.id;
  if (!id)
    throw new Error("API schemas in requests and responses must be named.");
  return id;
}

export function operationResponses(
  operation: ApiOperation,
): [number, ApiResponse][] {
  return Object.entries({ ...operation.responses, 401: UNAUTHORIZED }).map(
    ([status, response]) => [Number(status), response],
  );
}

export function operationParameters(
  operation: ApiOperation,
): OperationParameter[] {
  const path = pathParameterNames(operation.path).map(
    (name): OperationParameter => ({
      name,
      location: "path",
      required: true,
      description: null,
      schema:
        name === "format"
          ? { type: "string", enum: [...TRACK_EXPORT_FORMATS] }
          : { type: "string", format: "uuid" },
    }),
  );
  const query = Object.entries(operation.query?.shape ?? {}).map(
    ([name, field]): OperationParameter => {
      const schema = field as z.ZodType;
      const { description, ...rest } = bare(
        z.toJSONSchema(schema, { io: "input" }),
      );
      return {
        name,
        location: "query",
        required: !schema.safeParse(undefined).success,
        description: typeof description === "string" ? description : null,
        schema: rest,
      };
    },
  );
  return [...path, ...query];
}

export function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name = ""]) => name);
}

function buildDocument(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(apiSchemas, {
    uri: (id) => `${COMPONENT_REF}${id}`,
    io: "output",
  });
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of API_OPERATIONS) {
    paths[operation.path] ??= {};
    paths[operation.path]![operation.method.toLowerCase()] =
      describeOperation(operation);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Anysub API",
      version: API_VERSION,
      description:
        "Upload media, transcribe it and download subtitles. Authenticate with a personal access token from your account page.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ token: [] }],
    tags: [...new Set(API_OPERATIONS.map((operation) => operation.tag))].map(
      (name) => ({ name }),
    ),
    paths,
    components: {
      securitySchemes: {
        token: {
          type: "http",
          scheme: "bearer",
          description:
            "A personal access token. Read-only tokens can only use GET.",
        },
      },
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([id, schema]) => [id, bare(schema)]),
      ),
    },
  };
}

function describeOperation(operation: ApiOperation): Record<string, unknown> {
  return {
    operationId: operation.operationId,
    tags: [operation.tag],
    summary: operation.summary,
    ...(operation.description ? { description: operation.description } : {}),
    "x-token-scope": requiredScope(operation.method),
    parameters: operationParameters(operation).map(
      ({ name, location, required, description, schema }) => ({
        name,
        in: location,
        required,
        ...(description ? { description } : {}),
        schema,
      }),
    ),
    ...(operation.body
      ? {
          requestBody: {
            required: true,
            description: operation.body.description,
            content: {
              [operation.body.contentType]: {
                schema: operation.body.schema
                  ? reference(operation.body.schema)
                  : { type: "string", format: "binary" },
              },
            },
          },
        }
      : {}),
    responses: Object.fromEntries(
      operationResponses(operation).map(([status, response]) => [
        status,
        { description: response.description, ...responseContent(response) },
      ]),
    ),
  };
}

function responseContent(response: ApiResponse): JsonSchema {
  if (response.schema) {
    return {
      content: { "application/json": { schema: reference(response.schema) } },
    };
  }
  if (response.contentType) {
    return {
      content: {
        [response.contentType]: {
          schema: { type: "string", format: "binary" },
        },
      },
    };
  }
  return {};
}

function reference(schema: z.ZodType): JsonSchema {
  return { $ref: `${COMPONENT_REF}${schemaId(schema)}` };
}

// Component schemas live inside the document, so they need no $schema or
// $id of their own.
function bare(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema;
  return rest;
}
