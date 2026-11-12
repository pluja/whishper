import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
} from "../src/lib/shared/instance-settings.ts";
import { REMOTE_ADAPTER_ID } from "../src/lib/shared/transcription-models.ts";

const workerFile = (path: string) =>
  readFile(
    resolve(process.cwd(), "../../workers/inference/src/anysub_worker", path),
    "utf8",
  );

describe("worker protocol constants", () => {
  // The protocol schema carries types, not this value, so both sides declare it.
  it("names remote models with the worker's reserved adapter ID", async () => {
    const models = await workerFile("models.py");

    expect(/^REMOTE_ADAPTER_ID: Final = "([^"]+)"$/m.exec(models)?.[1]).toBe(
      REMOTE_ADAPTER_ID,
    );
  });

  // The application describes the options of remote models itself, so its
  // limits must match the ones the worker enforces.
  it("gives remote models the worker's line length limits", async () => {
    const options = await workerFile("options.py");
    const maxLineLength = /MAX_LINE_LENGTH = IntegerOption\(([^)]*)\)/s.exec(
      options,
    )?.[1];

    expect(/minimum=(\d+)/.exec(maxLineLength ?? "")?.[1]).toBe(
      String(MIN_LINE_LENGTH),
    );
    expect(/maximum=(\d+)/.exec(maxLineLength ?? "")?.[1]).toBe(
      String(MAX_LINE_LENGTH),
    );
  });
});
