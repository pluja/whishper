import { describe, expect, it } from "vitest";

import type { ProjectSummary } from "./library-data";
import {
  displayState,
  isPreparationActive,
  isProjectActive,
  isRunActive,
  isStudioActive,
  projectProgress,
  projectSourceFallback,
  stateLabel,
  statusTone,
} from "./project-status";

const idle: Pick<
  ProjectSummary,
  "runStatus" | "jobState" | "uploadStatus" | "mediaPreparationStatus"
> = {
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
  ] as const)("is true for %o", (override) => {
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
    expect(
      displayState({ ...idle, jobState: "leased", runStatus: "running" }),
    ).toBe("leased");
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
    originalFilename: null,
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

describe("stateLabel", () => {
  it.each([
    ["failed", "Needs attention"],
    ["cancelled", "Cancelled"],
    ["leased", "Processing"],
  ] as const)("labels %s as %s", (state, label) => {
    expect(stateLabel(state)).toBe(label);
  });
});

describe("statusTone", () => {
  it.each([
    ["ready", "success"],
    ["completed", "success"],
    ["queued", "accent"],
    ["leased", "accent"],
    ["running", "accent"],
    ["preparing", "accent"],
    ["uploading", "accent"],
    ["finalizing", "accent"],
    ["failed", "danger"],
    ["draft", "neutral"],
    ["cancelled", "neutral"],
  ] as const)("maps %s to %s", (state, tone) => {
    expect(statusTone(state)).toBe(tone);
  });
});

describe("projectProgress", () => {
  const progressIdle = {
    ...idle,
    progress: null,
    receivedBytes: null,
    sizeBytes: null,
  };

  it("is null while nothing is in flight", () => {
    expect(projectProgress({ ...progressIdle, progress: 1 })).toBeNull();
  });

  it("reports the uploaded fraction during an upload", () => {
    expect(
      projectProgress({
        ...progressIdle,
        uploadStatus: "uploading",
        receivedBytes: 25,
        sizeBytes: 100,
      }),
    ).toBe(0.25);
  });

  it("reports the job progress, starting at zero", () => {
    expect(
      projectProgress({ ...progressIdle, jobState: "leased", progress: 0.4 }),
    ).toBe(0.4);
    expect(projectProgress({ ...progressIdle, jobState: "queued" })).toBe(0);
  });
});
