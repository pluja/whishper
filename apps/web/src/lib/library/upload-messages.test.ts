import { describe, expect, it } from "vitest";

import { selectedFileProblem } from "./upload-messages";

const MIB = 1024 * 1024;

function fileOf(size: number, type: string): File {
  return new File([new Uint8Array(size)], "recording", { type });
}

describe("selectedFileProblem", () => {
  it("accepts audio, video and files without a declared type", () => {
    expect(selectedFileProblem(fileOf(10, "audio/mpeg"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(10, "video/mp4"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(10, ""), MIB)).toBeNull();
  });

  it("rejects files that are not media", () => {
    expect(selectedFileProblem(fileOf(10, "application/pdf"), MIB)).toBe(
      "This is not an audio or video file.",
    );
  });

  it("rejects an empty file", () => {
    expect(selectedFileProblem(fileOf(0, "video/mp4"), MIB)).toBe(
      "This file is empty.",
    );
  });

  it("accepts a file at the limit and rejects one over it", () => {
    expect(selectedFileProblem(fileOf(MIB, "video/mp4"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(2 * MIB, "video/mp4"), MIB)).toBe(
      "This file is 2.00 MiB, over the 1.00 MiB upload limit.",
    );
  });
});
