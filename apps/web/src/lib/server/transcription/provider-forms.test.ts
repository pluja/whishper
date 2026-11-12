import { describe, expect, it } from "vitest";

import {
  parseAddedModels,
  parseBaseUrl,
  parseModelForm,
  parseProviderForm,
} from "#lib/server/transcription/provider-forms.ts";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(name, item);
    }
  }
  return data;
}

describe("parseBaseUrl", () => {
  it("drops trailing slashes", () => {
    expect(parseBaseUrl("https://api.groq.com/openai/v1/")).toBe(
      "https://api.groq.com/openai/v1",
    );
  });

  it.each([
    ["ftp://files.example/v1", "https:// or http://"],
    ["https://user:secret@api.example/v1", "its own field"],
    ["https://api.example/v1?key=secret", "query"],
    ["api.openai.com", "base URL"],
  ])("refuses %s", (input, message) => {
    expect(() => parseBaseUrl(input)).toThrow(message);
  });
});

describe("parseProviderForm", () => {
  const fields = { name: "Local", baseUrl: "http://speaches:8000/v1" };

  it("stores no key when a new provider has none", () => {
    expect(
      parseProviderForm(form(fields), { editing: false }).apiKey,
    ).toBeNull();
  });

  it("keeps the saved key when editing with an empty field", () => {
    const providerId = "7f8a3c1e-0d5b-4a8e-9a43-0f5d2c9b1e77";
    expect(
      parseProviderForm(form({ ...fields, providerId }), { editing: true })
        .apiKey,
    ).toBe(undefined);
  });

  it("removes the key when asked, whatever the field holds", () => {
    expect(
      parseProviderForm(
        form({ ...fields, apiKey: "sk-new", removeApiKey: "on" }),
        { editing: true },
      ).apiKey,
    ).toBeNull();
  });

  it("refuses a key with spaces in it", () => {
    expect(() =>
      parseProviderForm(form({ ...fields, apiKey: "sk one two" }), {
        editing: false,
      }),
    ).toThrow("does not look right");
  });
});

describe("parseModelForm", () => {
  it("reads a price in dollars per minute", () => {
    expect(
      parseModelForm(form({ displayName: "Whisper", price: "$0.006" })),
    ).toEqual({ displayName: "Whisper", priceMicrosPerMinute: 6_000 });
  });

  it("treats an empty price as not set", () => {
    expect(
      parseModelForm(form({ displayName: "Whisper", price: "" }))
        .priceMicrosPerMinute,
    ).toBeNull();
  });

  it.each(["abc", "-1", "1,5", "500"])("refuses the price %s", (price) => {
    expect(() =>
      parseModelForm(form({ displayName: "Whisper", price })),
    ).toThrow("US dollars per minute");
  });
});

describe("parseAddedModels", () => {
  it("names a single model as typed and several by their IDs", () => {
    expect(
      parseAddedModels(form({ remoteId: "whisper-1", displayName: "Whisper" })),
    ).toEqual([{ remoteId: "whisper-1", displayName: "Whisper" }]);
    expect(
      parseAddedModels(
        form({ remoteId: ["a", "b", "a"], displayName: "Ignored" }),
      ),
    ).toEqual([
      { remoteId: "a", displayName: "a" },
      { remoteId: "b", displayName: "b" },
    ]);
  });

  it("refuses IDs with spaces and empty selections", () => {
    expect(() => parseAddedModels(form({ remoteId: "two words" }))).toThrow(
      "not a valid model ID",
    );
    expect(() => parseAddedModels(form({}))).toThrow("at least one model");
  });
});
