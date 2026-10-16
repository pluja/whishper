import { describe, expect, it } from "vitest";

import {
  defaultModelKey,
  type AvailableTranscriptionModel,
} from "./transcription-models";

function model(
  key: string,
  modelId: string,
  recommended = false,
): AvailableTranscriptionModel {
  return { key, modelId, recommended } as AvailableTranscriptionModel;
}

describe("defaultModelKey", () => {
  it("prefers the recommended model", () => {
    expect(
      defaultModelKey([model("a", "small"), model("b", "large", true)]),
    ).toBe("b");
  });

  it("falls back to small, then to the first model", () => {
    expect(defaultModelKey([model("a", "tiny"), model("b", "small")])).toBe(
      "b",
    );
    expect(defaultModelKey([model("a", "tiny"), model("b", "base")])).toBe("a");
  });

  it("is empty without models", () => {
    expect(defaultModelKey([])).toBe("");
  });
});
