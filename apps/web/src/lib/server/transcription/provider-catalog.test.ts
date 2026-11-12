import { describe, expect, it } from "vitest";

import { listCatalogModels } from "#lib/server/transcription/provider-catalog.ts";

const CONNECTION = {
  name: "OpenAI",
  baseUrl: "https://api.openai.test/v1",
  apiKey: "sk-test",
};

function answering(response: Response, seen: Request[] = []): typeof fetch {
  return async (input, init) => {
    seen.push(new Request(input, init));
    return response;
  };
}

describe("listCatalogModels", () => {
  it("lists speech models first and marks the ones already added", async () => {
    const seen: Request[] = [];
    const models = await listCatalogModels(
      CONNECTION,
      new Set(["whisper-1"]),
      answering(
        Response.json({
          object: "list",
          data: [
            { id: "gpt-4.1", object: "model" },
            { id: "gpt-4o-transcribe", object: "model" },
            { id: "whisper-1", object: "model" },
            { id: "distil-whisper-large-v3-en", object: "model" },
          ],
        }),
        seen,
      ),
    );

    expect(seen[0]?.url).toBe("https://api.openai.test/v1/models");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(models).toEqual([
      { remoteId: "distil-whisper-large-v3-en", kind: "speech", added: false },
      { remoteId: "whisper-1", kind: "speech", added: true },
      { remoteId: "gpt-4.1", kind: "other", added: false },
      { remoteId: "gpt-4o-transcribe", kind: "text-only", added: false },
    ]);
  });

  it("refuses to follow a redirect", async () => {
    const seen: Request[] = [];
    await expect(
      listCatalogModels(
        CONNECTION,
        new Set(),
        answering(
          new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.test/models" },
          }),
          seen,
        ),
      ),
    ).rejects.toThrow("redirects to another address");
    expect(seen[0]?.redirect).toBe("manual");
  });

  it("explains a rejected key", async () => {
    await expect(
      listCatalogModels(
        CONNECTION,
        new Set(),
        answering(new Response("{}", { status: 401 })),
      ),
    ).rejects.toThrow("OpenAI rejected the API key.");
  });

  it("points at the base URL when the answer is not a model list", async () => {
    await expect(
      listCatalogModels(
        CONNECTION,
        new Set(),
        answering(new Response("<html>Welcome</html>")),
      ),
    ).rejects.toThrow("OpenAI-compatible API");
  });

  it("explains an unreachable server", async () => {
    const unreachable: typeof fetch = async () => {
      throw new TypeError("fetch failed", {
        cause: new Error("getaddrinfo ENOTFOUND api.openai.test"),
      });
    };

    await expect(
      listCatalogModels(CONNECTION, new Set(), unreachable),
    ).rejects.toThrow("Could not reach OpenAI: getaddrinfo ENOTFOUND");
  });
});

describe("listCatalogModels with typed entries", () => {
  it("follows the type each model is listed with", async () => {
    const models = await listCatalogModels(
      CONNECTION,
      new Set(),
      answering(
        Response.json({
          data: [
            { id: "voxtral-small-24b", type: "audio" },
            { id: "qwen3-tts", type: "tts" },
            { id: "whisper-large-v3-turbo", type: "audio" },
            { id: "gemma4-31b", type: "chat" },
          ],
        }),
      ),
    );

    expect(models.filter((model) => model.kind === "speech")).toEqual([
      { remoteId: "whisper-large-v3-turbo", kind: "speech", added: false },
    ]);
    expect(models.at(-1)).toEqual({
      remoteId: "voxtral-small-24b",
      kind: "text-only",
      added: false,
    });
  });
});
