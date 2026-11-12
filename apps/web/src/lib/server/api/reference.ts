import {
  API_OPERATIONS,
  type ApiOperation,
} from "#lib/server/api/operations.ts";
import {
  openApiDocument,
  operationParameters,
  operationResponses,
  pathParameterNames,
  schemaId,
} from "#lib/server/api/openapi.ts";
import type {
  ReferenceOperation,
  ReferencePage,
} from "#lib/shared/api-reference.ts";
import { requiredScope } from "#lib/shared/api-tokens.ts";
import { isRecord } from "#lib/shared/is-record.ts";

const EXAMPLE_FORMAT = "srt";

export function apiReference(
  version: string,
  origin: string,
  exampleModel: string,
): ReferencePage {
  const components = openApiDocument().components;
  const schemas =
    isRecord(components) && isRecord(components.schemas)
      ? components.schemas
      : {};
  return {
    version,
    operations: API_OPERATIONS.map((operation) =>
      referenceOperation(operation, origin, exampleModel),
    ),
    schemas: Object.entries(schemas).map(([name, schema]) => ({
      name,
      json: JSON.stringify(schema, null, 2),
    })),
  };
}

function referenceOperation(
  operation: ApiOperation,
  origin: string,
  exampleModel: string,
): ReferenceOperation {
  return {
    id: operation.operationId,
    tag: operation.tag,
    method: operation.method,
    path: `/api/v1${operation.path}`,
    summary: operation.summary,
    description: operation.description ?? null,
    scope: requiredScope(operation.method),
    parameters: operationParameters(operation).map(
      ({ schema, ...parameter }) => ({ ...parameter, type: typeName(schema) }),
    ),
    body: operation.body
      ? {
          contentType: operation.body.contentType,
          description: operation.body.description,
          schema: operation.body.schema
            ? schemaId(operation.body.schema)
            : null,
        }
      : null,
    responses: operationResponses(operation).map(([status, response]) => ({
      status,
      description: response.description,
      schema: response.schema ? schemaId(response.schema) : null,
    })),
    curl: curlExample(operation, origin, exampleModel),
  };
}

// Path parameters become shell variables, such as $PROJECT_ID.
function curlExample(
  operation: ApiOperation,
  origin: string,
  exampleModel: string,
): string {
  let path = operation.path;
  for (const name of pathParameterNames(path)) {
    const value =
      name === "format"
        ? EXAMPLE_FORMAT
        : `$${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
    path = path.replace(`{${name}}`, value);
  }
  const query = operation.example?.query ? `?${operation.example.query}` : "";
  const url = `${origin}/api/v1${path}${query}`;
  return [
    `curl -H "Authorization: Bearer $ANYSUB_TOKEN"`,
    // A body already implies POST, and curl warns about a redundant -X.
    ...(operation.method === "GET" || operation.body
      ? []
      : [`-X ${operation.method}`]),
    ...(operation.example?.arguments ?? []).map((argument) =>
      argument.replace("$MODEL", exampleModel),
    ),
    query ? `"${url}"` : url,
  ].join(" \\\n  ");
}

function typeName(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum)) return schema.enum.join(" | ");
  const type = Array.isArray(schema.type)
    ? schema.type.join(" | ")
    : schema.type;
  return typeof schema.format === "string"
    ? `${String(type)} (${schema.format})`
    : String(type ?? "string");
}
