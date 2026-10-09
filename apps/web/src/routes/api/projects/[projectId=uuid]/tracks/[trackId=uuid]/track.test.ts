import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateTrackForUser } = vi.hoisted(() => ({
  updateTrackForUser: vi.fn(),
}));
vi.mock("$lib/server/access", () => ({ requireUser: () => ({ id: "user" }) }));
vi.mock("$lib/server/subtitle-editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/server/subtitle-editor")>()),
  updateTrackForUser,
}));

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
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("answers 404 when the track does not exist", async () => {
    updateTrackForUser.mockResolvedValue(null);

    await expect(callPut({ revision: 1, cues: [] })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("hides the cause of unexpected failures behind a fixed 500", async () => {
    updateTrackForUser.mockRejectedValue(new Error("password=hunter2"));

    await expect(callPut({ revision: 1, cues: [] })).rejects.toMatchObject({
      status: 500,
      body: { message: "The subtitle track could not be saved." },
    });
  });
});
