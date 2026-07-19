import { describe, expect, it } from "vitest";

import { availableTranscriptionModels } from "$lib/server/adapters";

describe("available transcription models", () => {
  it("combines active worker manifests, hides diagnostics, and deduplicates models", () => {
    const whisperx = {
      id: "whisperx",
      displayName: "WhisperX",
      version: "1",
      protocolVersion: "1.0",
      models: [
        {
          id: "small",
          displayName: "Small",
          capabilities: ["transcribe", "align"],
          languages: "all",
          optionsSchema: { type: "object" },
        },
      ],
    };
    const models = availableTranscriptionModels([
      { adapters: [whisperx, { ...whisperx, id: "builtin.fake" }] },
      { adapters: [whisperx] },
      { adapters: "invalid" },
    ]);

    expect(models).toEqual([
      expect.objectContaining({
        key: "whisperx:small",
        adapterId: "whisperx",
        modelId: "small",
      }),
    ]);
  });
});
