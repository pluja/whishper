import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateTrackForUser } = vi.hoisted(() => ({
  updateTrackForUser: vi.fn(),
}));
vi.mock("$lib/server/auth/session", () => ({
  requireUser: () => ({ id: "user" }),
}));
vi.mock("$lib/server/subtitles/track-editor", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("$lib/server/subtitles/track-editor")
  >()),
  updateTrackForUser,
}));

import {
  TrackLockedByTranscription,
  TrackRevisionConflict,
} from "$lib/server/subtitles/track-editor";

import { PUT } from "./+server";

const projectId = "b14d765a-0cb2-4fa8-af80-c563ab57c959";
const callPut = (body: unknown) =>
  PUT({
    locals: {},
    params: { projectId, trackId: projectId },
    request: new Request("http://localhost/track", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof PUT>[0]);

describe("track update route", () => {
  beforeEach(() => {
    updateTrackForUser.mockReset();
  });

  it("answers 404 when the track does not exist", async () => {
    updateTrackForUser.mockResolvedValue(null);

    await expect(callPut({ revision: 1, cues: [] })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("answers 400 with the reason of an invalid update", async () => {
    const response = await callPut({ revision: -1, cues: [] });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "A valid track revision is required.",
    });
    expect(updateTrackForUser).not.toHaveBeenCalled();
  });

  it("answers 409 with the current revision on a conflict", async () => {
    updateTrackForUser.mockRejectedValue(new TrackRevisionConflict(4));

    const response = await callPut({ revision: 1, cues: [] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "revision_conflict",
      revision: 4,
    });
  });

  it("answers 409 with the reason while a transcription is running", async () => {
    updateTrackForUser.mockRejectedValue(new TrackLockedByTranscription());

    const response = await callPut({ revision: 1, cues: [] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "transcription_running",
      message:
        "A new transcription is running for this project. Editing resumes when it finishes or is cancelled.",
    });
  });

  it("hands unexpected failures to the error hook with a safe message", async () => {
    const failure = new Error("password=hunter2");
    updateTrackForUser.mockRejectedValue(failure);

    await expect(callPut({ revision: 1, cues: [] })).rejects.toMatchObject({
      name: "ServerFailure",
      message: "The subtitle track could not be saved.",
      cause: failure,
    });
  });
});
