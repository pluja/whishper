import { describe, expect, it } from "vitest";

import {
  defaultModelKey,
  modelKey,
  parseModelKey,
} from "./transcription-models";

function model(key: string, modelId: string, recommended = false) {
  return { key, modelId, recommended };
}

describe("parseModelKey", () => {
  it("reads back the parts of a model key", () => {
    expect(parseModelKey(modelKey("whisperx", "large-v3"))).toEqual({
      adapterId: "whisperx",
      modelId: "large-v3",
    });
  });

  it.each(["small", ":small", "whisperx:", ""])("rejects %j", (key) => {
    expect(parseModelKey(key)).toBeNull();
  });
});

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
