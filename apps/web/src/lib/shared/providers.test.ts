import { describe, expect, it } from "vitest";

import { classifyRemoteModel } from "#lib/shared/providers.ts";

describe("classifyRemoteModel", () => {
  it.each([
    ["whisper-large-v3-turbo", "audio", "speech"],
    ["voxtral-small-24b", "audio", "text-only"],
    ["voxtral-mini-4b-realtime", "audio", "text-only"],
    ["qwen3-tts", "tts", "other"],
    ["gpt-oss-120b", "chat", "other"],
    ["whisper-tiny", "embedding", "other"],
  ])("uses the type the provider gives: %s (%s)", (remoteId, type, kind) => {
    expect(classifyRemoteModel(remoteId, type)).toBe(kind);
  });

  it.each([
    ["whisper-1", "speech"],
    ["voxtral-mini-latest", "text-only"],
    ["gpt-4o-transcribe", "text-only"],
    ["gpt-4o-mini-transcribe-2025-12-15", "text-only"],
    ["tts-1", "other"],
    ["gpt-4.1", "other"],
  ])("guesses from the name without a type: %s", (remoteId, kind) => {
    expect(classifyRemoteModel(remoteId)).toBe(kind);
  });
});
