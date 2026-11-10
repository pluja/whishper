import { beforeEach, describe, expect, it, vi } from "vitest";

const { projectForUser, studioStatus } = vi.hoisted(() => ({
  projectForUser: vi.fn(),
  studioStatus: vi.fn(),
}));
vi.mock("$lib/server/auth/session", () => ({
  requireUser: () => ({ id: "user" }),
}));
vi.mock("$lib/server/projects/access", () => ({ projectForUser }));
vi.mock("$lib/server/projects/studio", () => ({ studioStatus }));

import { GET } from "./+server";

const projectId = "b14d765a-0cb2-4fa8-af80-c563ab57c959";
const callGet = () =>
  GET({ locals: {}, params: { projectId } } as Parameters<typeof GET>[0]);

describe("project status route", () => {
  beforeEach(() => {
    projectForUser.mockReset();
    studioStatus.mockReset();
  });

  it("answers 404 for a project the user cannot open", async () => {
    projectForUser.mockReturnValue(null);

    await expect(callGet()).rejects.toMatchObject({ status: 404 });
    expect(studioStatus).not.toHaveBeenCalled();
  });

  it("answers with the latest run and preparation, never cached", async () => {
    const status = { run: null, preparation: { state: "running" } };
    projectForUser.mockReturnValue({ id: projectId });
    studioStatus.mockReturnValue(status);

    const response = await callGet();

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(status);
  });
});
