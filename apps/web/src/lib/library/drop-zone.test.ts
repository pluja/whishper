import { describe, expect, it } from "vitest";
import { carriesMediaFile, firstDroppedMediaFile } from "./drop-zone";

function transfer(files: File[]): DataTransfer {
  return {
    files: Object.assign(files, { item: (i: number) => files[i] }),
  } as unknown as DataTransfer;
}

describe("firstDroppedMediaFile", () => {
  it("returns the first audio or video file", () => {
    const text = new File(["x"], "notes.txt", { type: "text/plain" });
    const video = new File(["x"], "clip.mp4", { type: "video/mp4" });
    expect(firstDroppedMediaFile(transfer([text, video]))).toBe(video);
  });

  it("accepts files without a declared type", () => {
    const unknown = new File(["x"], "recording", { type: "" });
    expect(firstDroppedMediaFile(transfer([unknown]))).toBe(unknown);
  });

  it("returns null when nothing usable was dropped", () => {
    expect(firstDroppedMediaFile(null)).toBeNull();
    expect(
      firstDroppedMediaFile(
        transfer([new File(["x"], "a.pdf", { type: "application/pdf" })]),
      ),
    ).toBeNull();
  });
});

function dragged(items: { kind: string; type: string }[]): DataTransfer {
  return { items } as unknown as DataTransfer;
}

describe("carriesMediaFile", () => {
  it("is true when any dragged file has an accepted or empty type", () => {
    expect(
      carriesMediaFile(
        dragged([
          { kind: "file", type: "application/pdf" },
          { kind: "file", type: "audio/ogg" },
        ]),
      ),
    ).toBe(true);
    expect(carriesMediaFile(dragged([{ kind: "file", type: "" }]))).toBe(true);
  });

  it("is false for other files, text and missing data", () => {
    expect(
      carriesMediaFile(dragged([{ kind: "file", type: "image/png" }])),
    ).toBe(false);
    expect(
      carriesMediaFile(dragged([{ kind: "string", type: "video/mp4" }])),
    ).toBe(false);
    expect(carriesMediaFile(null)).toBe(false);
  });
});
