import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import {
  answering,
  seedRemoteModel,
  TEST_API_KEY,
} from "#lib/server/db/testing/remote.ts";
import {
  addProvider,
  saveProvider,
} from "#lib/server/transcription/provider-setup.ts";
import { adminProviders } from "#lib/server/transcription/providers.ts";

describe("provider setup", () => {
  it("keep the key unless the administrator replaces or removes it, with no check to remove it", async () => {
    const { providerId } = seedRemoteModel();
    const changes = { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" };
    const calls: Request[] = [];

    await saveProvider(
      providerId,
      { ...changes, apiKey: undefined },
      {
        noModelList: false,
        fetcher: answering(Response.json({ data: [] }), calls),
      },
    );
    expect(calls).toHaveLength(0);
    expect(adminProviders(db)[0]?.hasApiKey).toBe(true);

    await saveProvider(
      providerId,
      { ...changes, apiKey: null },
      {
        noModelList: false,
        fetcher: answering(Response.json({ data: [] }), calls),
      },
    );
    expect(calls).toHaveLength(0);
    expect(adminProviders(db)[0]).toMatchObject({
      hasApiKey: false,
      apiKeyHint: null,
    });
  });

  it("ask for the key again before the base URL moves to another server", async () => {
    const { providerId } = seedRemoteModel();
    const calls: Request[] = [];

    await expect(
      saveProvider(
        providerId,
        {
          name: "Groq",
          baseUrl: "https://groq.example.net/openai/v1",
          apiKey: undefined,
        },
        {
          noModelList: false,
          fetcher: answering(Response.json({ data: [] }), calls),
        },
      ),
    ).rejects.toThrow("Enter its API key");
    expect(calls).toHaveLength(0);

    await saveProvider(
      providerId,
      {
        name: "Groq",
        baseUrl: "https://api.groq.com/openai/v2",
        apiKey: undefined,
      },
      {
        noModelList: false,
        fetcher: answering(Response.json({ data: [] }), calls),
      },
    );
    expect(calls[0]?.headers.get("authorization")).toBe(
      `Bearer ${TEST_API_KEY}`,
    );
    expect(adminProviders(db)[0]).toMatchObject({
      baseUrl: "https://api.groq.com/openai/v2",
      hasApiKey: true,
    });
  });

  it("keep a changed connection that does not answer from being saved", async () => {
    const { providerId } = seedRemoteModel();

    await expect(
      saveProvider(
        providerId,
        {
          name: "Groq",
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: "gsk_wrong_key_000000000",
        },
        {
          noModelList: false,
          fetcher: answering(new Response("{}", { status: 401 })),
        },
      ),
    ).rejects.toThrow("rejected the API key");
    expect(adminProviders(db)[0]?.apiKeyHint).toBe("WXYZ");
  });

  it("are added with their transcription models once they answer", async () => {
    const setup = await addProvider(
      {
        name: "OpenAI",
        baseUrl: "https://api.openai.test/v1",
        apiKey: TEST_API_KEY,
      },
      {
        noModelList: false,
        fetcher: answering(
          Response.json({
            data: [
              { id: "whisper-1" },
              { id: "gpt-4o-transcribe" },
              { id: "gpt-4.1" },
            ],
          }),
        ),
      },
    );

    expect(setup).toEqual({
      name: "OpenAI",
      addedModels: 1,
      hasModelList: true,
    });
    expect(
      adminProviders(db)[0]?.models.map((model) => model.remoteId),
    ).toEqual(["whisper-1"]);
  });

  it("are not added when the key is rejected", async () => {
    await expect(
      addProvider(
        {
          name: "OpenAI",
          baseUrl: "https://api.openai.test/v1",
          apiKey: TEST_API_KEY,
        },
        {
          noModelList: false,
          fetcher: answering(new Response("{}", { status: 401 })),
        },
      ),
    ).rejects.toThrow("rejected the API key");
    expect(adminProviders(db)).toEqual([]);
  });

  it("are not added when the address has no model list", async () => {
    await expect(
      addProvider(
        {
          name: "OpenAI",
          baseUrl: "https://api.openai.com",
          apiKey: TEST_API_KEY,
        },
        {
          noModelList: false,
          fetcher: answering(new Response("{}", { status: 404 })),
        },
      ),
    ).rejects.toThrow("usually ends in /v1");
    expect(adminProviders(db)).toEqual([]);
  });

  it("are added unchecked when the server has no model list", async () => {
    const calls: Request[] = [];
    const setup = await addProvider(
      { name: "Local", baseUrl: "http://speech:8000/v1", apiKey: null },
      {
        noModelList: true,
        fetcher: answering(Response.json({ data: [] }), calls),
      },
    );

    expect(calls).toHaveLength(0);
    expect(setup).toEqual({
      name: "Local",
      addedModels: 0,
      hasModelList: false,
    });
    expect(adminProviders(db)[0]?.models).toEqual([]);
  });
});
