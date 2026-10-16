import { describe, expect, it } from "vitest";

import { originalStorageKey } from "./paths";

describe("originalStorageKey", () => {
  it("uses IDs and a stable source name for canonical storage", () => {
    expect(
      originalStorageKey(
        "22b33a3a-31c8-4f33-b3d8-83a236c42dd1",
        "8dac7ff0-bac3-47c3-bd1a-e0fdff8d6ad2",
        "Film.MP4",
      ),
    ).toBe(
      "workspaces/22b33a3a-31c8-4f33-b3d8-83a236c42dd1/projects/8dac7ff0-bac3-47c3-bd1a-e0fdff8d6ad2/media/original/source.mp4",
    );
  });
});
