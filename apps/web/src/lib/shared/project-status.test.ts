import { describe, expect, it } from "vitest";

import {
  displayState,
  isPreparationActive,
  isProjectActive,
  isRunActive,
  isStudioActive,
  mediaPlaceholder,
  projectMessage,
  projectSourceFallback,
  stateLabel,
} from "./project-status";

const idle = {
  run_status: null,
  job_state: null,
  upload_status: "completed",
  media_preparation_status: "completed",
};

describe("isProjectActive", () => {
  it("is false for an idle project", () => {
    expect(isProjectActive(idle)).toBe(false);
  });

  it.each([
    { job_state: "queued" },
    { job_state: "leased" },
    { upload_status: "uploading" },
    { upload_status: "finalizing" },
    { media_preparation_status: "queued" },
    { media_preparation_status: "running" },
  ])("is true for %o", (override) => {
    expect(isProjectActive({ ...idle, ...override })).toBe(true);
  });

  it("is false for terminal states", () => {
    expect(
      isProjectActive({
        ...idle,
        job_state: "failed",
        media_preparation_status: "failed",
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
      displayState({ ...idle, job_state: "leased", run_status: "x" }),
    ).toBe("leased");
    expect(displayState({ ...idle, run_status: "completed" })).toBe(
      "completed",
    );
  });

  it("falls back to preparation and upload state", () => {
    expect(displayState({ ...idle, media_preparation_status: "running" })).toBe(
      "preparing",
    );
    expect(displayState({ ...idle, media_preparation_status: "failed" })).toBe(
      "failed",
    );
    expect(displayState(idle)).toBe("ready");
    expect(displayState({ ...idle, upload_status: null })).toBe("draft");
    expect(displayState({ ...idle, upload_status: "uploading" })).toBe(
      "uploading",
    );
  });
});

describe("projectMessage", () => {
  const base = {
    progress_message: null,
    upload_status: null,
    received_bytes: null,
    size_bytes: null,
  };

  it("uses the job progress message first", () => {
    expect(projectMessage({ ...base, progress_message: "Working" })).toBe(
      "Working",
    );
  });

  it("reports upload percentage", () => {
    expect(
      projectMessage({
        ...base,
        upload_status: "uploading",
        received_bytes: 50,
        size_bytes: 200,
      }),
    ).toBe("Uploading · 25%");
  });

  it("describes finalizing, completed and default states", () => {
    expect(projectMessage({ ...base, upload_status: "finalizing" })).toBe(
      "Finalizing source media",
    );
    expect(projectMessage({ ...base, upload_status: "completed" })).toBe(
      "Source media stored",
    );
    expect(projectMessage(base)).toBe("Project ready");
  });
});

describe("projectSourceFallback", () => {
  const base = {
    progress_message: null,
    upload_status: null,
    received_bytes: null,
    size_bytes: null,
  };

  it("names the media kind when there is no status message", () => {
    expect(projectSourceFallback({ ...base, media_type: "audio/mpeg" })).toBe(
      "Audio source",
    );
    expect(projectSourceFallback({ ...base, media_type: "video/mp4" })).toBe(
      "Video source",
    );
    expect(projectSourceFallback({ ...base, media_type: null })).toBe(
      "Media source",
    );
  });

  it("prefers a real status message", () => {
    expect(
      projectSourceFallback({
        ...base,
        upload_status: "finalizing",
        media_type: "video/mp4",
      }),
    ).toBe("Finalizing source media");
  });
});

describe("stateLabel and mediaPlaceholder", () => {
  it("maps known states and passes unknown ones through", () => {
    expect(stateLabel("failed")).toBe("Needs attention");
    expect(stateLabel("weird")).toBe("weird");
  });

  it("picks an icon per media type", () => {
    expect(mediaPlaceholder({ media_type: "audio/wav" }).icon).toBe("audio");
    expect(mediaPlaceholder({ media_type: "video/mp4" }).icon).toBe("play");
    expect(mediaPlaceholder({ media_type: null }).icon).toBe("file");
  });
});
