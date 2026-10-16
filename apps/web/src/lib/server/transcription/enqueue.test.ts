import { describe, expect, it } from "vitest";

import { parseTranscriptionRequest } from "./enqueue";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("parseTranscriptionRequest", () => {
  it("splits the model key and applies the defaults", () => {
    expect(
      parseTranscriptionRequest(form({ model: "whisperx:large-v3" })),
    ).toEqual({
      adapterId: "whisperx",
      modelId: "large-v3",
      language: null,
      options: { alignment: false, maxLineLength: 42 },
    });
  });

  it("keeps an explicit language, alignment and batch size", () => {
    expect(
      parseTranscriptionRequest(
        form({
          model: "whisperx:small",
          language: "pt-BR",
          alignment: "on",
          batchSize: "16",
          maxLineLength: "60",
        }),
      ),
    ).toMatchObject({
      language: "pt-BR",
      options: { alignment: true, maxLineLength: 60, batchSize: 16 },
    });
  });

  it.each([
    [{ model: "small" }, "Choose an available transcription model."],
    [
      { model: "a:b", language: "Portuguese" },
      "Choose a valid transcription language.",
    ],
    [{ model: "a:b", batchSize: "65" }, "Batch size must be between 1 and 64."],
    [
      { model: "a:b", maxLineLength: "19" },
      "Maximum line length must be between 20 and 120 characters.",
    ],
  ])("rejects %o with a 400", (values, message) => {
    expect(() => parseTranscriptionRequest(form(values))).toThrow(
      expect.objectContaining({ statusCode: 400, message }),
    );
  });
});
