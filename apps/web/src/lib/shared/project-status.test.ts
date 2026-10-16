import { describe, expect, it } from "vitest";

import {
  displayState,
  isPreparationActive,
  isProjectActive,
  isRunActive,
  isStudioActive,
  mediaPlaceholder,
  projectSourceFallback,
  stateLabel,
} from "./project-status";

const idle = {
  runStatus: null,
  jobState: null,
  uploadStatus: "completed",
  mediaPreparationStatus: "completed",
};

describe("isProjectActive", () => {
  it("is false for an idle project", () => {
    expect(isProjectActive(idle)).toBe(false);
  });

  it.each([
    { jobState: "queued" },
    { jobState: "leased" },
    { uploadStatus: "uploading" },
    { uploadStatus: "finalizing" },
    { mediaPreparationStatus: "queued" },
    { mediaPreparationStatus: "running" },
  ])("is true for %o", (override) => {
    expect(isProjectActive({ ...idle, ...override })).toBe(true);
  });

  it("is false for terminal states", () => {
    expect(
      isProjectActive({
        ...idle,
        jobState: "failed",
        mediaPreparationStatus: "failed",
      }),
    ).toBe(false);
  });
});

describe("isRunActive", () => {
  it.each([
    ["queued", true],
    ["running", true],
    ["completed", false],
    ["failed", false],
  ])("treats a %s run as active: %s", (status, active) => {
    expect(isRunActive({ status })).toBe(active);
  });

  it("is false without a run", () => {
    expect(isRunActive(null)).toBe(false);
  });
});

describe("isPreparationActive", () => {
  it.each([
    ["queued", true],
    ["leased", true],
    ["running", false],
    ["completed", false],
    ["cancelled", false],
  ])("treats a %s preparation job as active: %s", (state, active) => {
    expect(isPreparationActive({ state })).toBe(active);
  });

  it("is false without a preparation job", () => {
    expect(isPreparationActive(null)).toBe(false);
  });
});

describe("isStudioActive", () => {
  it("detects a queued or running transcription run", () => {
    expect(
      isStudioActive({ run: { status: "running" }, preparation: null }),
    ).toBe(true);
    expect(
      isStudioActive({ run: { status: "completed" }, preparation: null }),
    ).toBe(false);
  });

  it("detects a queued or leased preparation job", () => {
    expect(
      isStudioActive({ run: null, preparation: { state: "leased" } }),
    ).toBe(true);
    expect(
      isStudioActive({ run: null, preparation: { state: "succeeded" } }),
    ).toBe(false);
  });

  it("is false with nothing in flight", () => {
    expect(isStudioActive({ run: null, preparation: null })).toBe(false);
  });
});

describe("displayState", () => {
  it("prefers the job state, then the run status", () => {
    expect(displayState({ ...idle, jobState: "leased", runStatus: "x" })).toBe(
      "leased",
    );
    expect(displayState({ ...idle, runStatus: "completed" })).toBe("completed");
  });

  it("falls back to preparation and upload state", () => {
    expect(displayState({ ...idle, mediaPreparationStatus: "running" })).toBe(
      "preparing",
    );
    expect(displayState({ ...idle, mediaPreparationStatus: "failed" })).toBe(
      "failed",
    );
    expect(displayState(idle)).toBe("ready");
    expect(displayState({ ...idle, uploadStatus: null })).toBe("draft");
    expect(displayState({ ...idle, uploadStatus: "uploading" })).toBe(
      "uploading",
    );
  });
});

describe("projectSourceFallback", () => {
  const base = {
    progressMessage: null,
    uploadStatus: null,
    receivedBytes: null,
    sizeBytes: null,
  };

  it("names the media kind when there is no status message", () => {
    expect(projectSourceFallback({ ...base, mediaType: "audio/mpeg" })).toBe(
      "Audio source",
    );
    expect(projectSourceFallback({ ...base, mediaType: "video/mp4" })).toBe(
      "Video source",
    );
    expect(projectSourceFallback({ ...base, mediaType: null })).toBe(
      "Media source",
    );
  });

  it("prefers the job progress message", () => {
    expect(
      projectSourceFallback({
        ...base,
        progressMessage: "Working",
        mediaType: "video/mp4",
      }),
    ).toBe("Working");
  });

  it("reports upload percentage", () => {
    expect(
      projectSourceFallback({
        ...base,
        uploadStatus: "uploading",
        receivedBytes: 50,
        sizeBytes: 200,
        mediaType: "video/mp4",
      }),
    ).toBe("Uploading · 25%");
  });

  it("describes finalizing and stored sources", () => {
    expect(
      projectSourceFallback({
        ...base,
        uploadStatus: "finalizing",
        mediaType: "video/mp4",
      }),
    ).toBe("Finalizing source media");
    expect(
      projectSourceFallback({
        ...base,
        uploadStatus: "completed",
        mediaType: "video/mp4",
      }),
    ).toBe("Source media stored");
  });
});

describe("stateLabel and mediaPlaceholder", () => {
  it("maps known states and passes unknown ones through", () => {
    expect(stateLabel("failed")).toBe("Needs attention");
    expect(stateLabel("weird")).toBe("weird");
  });

  it("picks an icon per media type", () => {
    expect(mediaPlaceholder({ mediaType: "audio/wav" }).icon).toBe("audio");
    expect(mediaPlaceholder({ mediaType: "video/mp4" }).icon).toBe("play");
    expect(mediaPlaceholder({ mediaType: null }).icon).toBe("file");
  });
});
