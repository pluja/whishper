import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { API_OPERATIONS } from "#lib/server/api/operations.ts";
import { openApiDocument } from "#lib/server/api/openapi.ts";
import { apiReference } from "#lib/server/api/reference.ts";

const ROUTES = resolve(process.cwd(), "src/routes/api/v1");
const ROUTE_PARAMETERS: Record<string, string> = {
  "{projectId}": "[projectId=uuid]",
  "{transcriptionId}": "[transcriptionId=uuid]",
  "{trackId}": "[trackId=uuid]",
  "{format}": "[format]",
};

function routeFile(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => ROUTE_PARAMETERS[segment] ?? segment);
  return resolve(ROUTES, ...segments, "+server.ts");
}

describe("API description", () => {
  it.each(
    API_OPERATIONS.map((operation) => [operation.method, operation.path]),
  )("has a route for %s %s", async (method, path) => {
    const file = routeFile(path);
    await access(file);
    expect(await readFile(file, "utf8")).toMatch(
      new RegExp(`export const ${method}\\b`),
    );
  });

  it("refers only to schemas it defines", () => {
    const description = openApiDocument();
    const document = JSON.stringify(description);
    const schemas = Object.keys(
      (description.components as { schemas: object }).schemas,
    );

    const references = [
      ...document.matchAll(/"#\/components\/schemas\/(\w+)"/g),
    ].map(([, name]) => name);
    expect(references.length).toBeGreaterThan(0);
    for (const name of references) expect(schemas).toContain(name);
  });

  it("needs a write token for everything but GET", () => {
    const paths = openApiDocument().paths as Record<
      string,
      Record<string, { "x-token-scope": string }>
    >;
    for (const operation of API_OPERATIONS) {
      const described = paths[operation.path]?.[operation.method.toLowerCase()];
      expect(described?.["x-token-scope"]).toBe(
        operation.method === "GET" ? "read" : "write",
      );
    }
  });

  it("builds runnable curl examples", () => {
    const { operations } = apiReference(
      "1",
      "https://anysub.example",
      "whisperx:large-v3-turbo",
    );
    const curl = (id: string) =>
      operations.find((operation) => operation.id === id)?.curl;

    expect(curl("startTranscription")).toBe(
      [
        'curl -H "Authorization: Bearer $ANYSUB_TOKEN"',
        '-H "Content-Type: application/json"',
        `-d '{"model": "whisperx:large-v3-turbo"}'`,
        "https://anysub.example/api/v1/projects/$PROJECT_ID/transcriptions",
      ].join(" \\\n  "),
    );
    expect(curl("deleteProject")).toContain("-X DELETE");
    expect(curl("exportTrack")).toContain(
      "/projects/$PROJECT_ID/tracks/$TRACK_ID/export/srt",
    );
    expect(curl("createProject")).toContain(
      '"https://anysub.example/api/v1/projects?filename=talk.mp4"',
    );
    for (const operation of operations) {
      expect(operation.curl).not.toMatch(/[{}]\w|\w[{}]/);
    }
  });
});
