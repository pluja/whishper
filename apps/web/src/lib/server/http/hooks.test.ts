import type { RequestEvent } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { WORKER_TOKEN, getSession, handleUploadRequest } = vi.hoisted(() => ({
  WORKER_TOKEN: "worker-token-for-hook-tests",
  getSession: vi.fn(),
  handleUploadRequest: vi.fn(),
}));
vi.mock("$lib/server/env", () => ({
  privateEnv: {
    workerToken: WORKER_TOKEN,
    authUrl: "https://anysub.example",
  },
}));
vi.mock("$lib/server/auth/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("$lib/server/uploads/tus-server", () => ({
  handleUploadRequest,
  isUploadPath: (pathname: string) => pathname.startsWith("/api/uploads"),
}));

import { ServerFailure } from "./errors";
import {
  authenticateWorkers,
  handleUploads,
  loadSession,
  logServerErrors,
  rejectCrossOriginRequests,
  requireProjectApiSession,
} from "./hooks";

const user = { id: "user-1" };

function eventFor(path: string, headers: HeadersInit = {}): RequestEvent {
  const url = new URL(path, "https://anysub.example");
  return {
    url,
    request: new Request(url, { headers }),
    locals: {},
  } as RequestEvent;
}

function resolveOk() {
  return vi.fn(async () => new Response("resolved"));
}

beforeEach(() => {
  getSession.mockReset();
  handleUploadRequest.mockReset();
});

describe("authenticateWorkers", () => {
  it("rejects an internal request without the worker token", async () => {
    const resolve = resolveOk();
    const response = await authenticateWorkers({
      event: eventFor("/api/internal/workers/lease", {
        authorization: "Bearer wrong",
      }),
      resolve,
    });

    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("passes an internal request with the worker token", async () => {
    const resolve = resolveOk();
    const response = await authenticateWorkers({
      event: eventFor("/api/internal/workers/lease", {
        authorization: `Bearer ${WORKER_TOKEN}`,
      }),
      resolve,
    });

    expect(response.status).toBe(200);
  });

  it("ignores paths outside the internal API", async () => {
    const resolve = resolveOk();
    await authenticateWorkers({ event: eventFor("/api/internals"), resolve });

    expect(resolve).toHaveBeenCalledOnce();
  });
});

describe("loadSession", () => {
  it.each(["/api/internal/jobs/1/progress", "/api/health"])(
    "skips the session lookup for %s",
    async (path) => {
      const event = eventFor(path);
      await loadSession({ event, resolve: resolveOk() });

      expect(getSession).not.toHaveBeenCalled();
      expect(event.locals.user).toBeNull();
    },
  );

  it("loads the session for other requests", async () => {
    getSession.mockResolvedValue({ user, session: { id: "session-1" } });
    const event = eventFor("/projects/1");
    await loadSession({ event, resolve: resolveOk() });

    expect(event.locals.user).toBe(user);
    expect(event.locals.session).toEqual({ id: "session-1" });
  });
});

describe("requireProjectApiSession", () => {
  it("answers 401 to a project API request without a session", async () => {
    const event = eventFor("/api/projects/1/media");
    event.locals.user = null;
    const resolve = resolveOk();
    const response = await requireProjectApiSession({ event, resolve });

    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("passes a signed-in project API request", async () => {
    const event = eventFor("/api/projects/1/media");
    event.locals.user = user as App.Locals["user"];
    const response = await requireProjectApiSession({
      event,
      resolve: resolveOk(),
    });

    expect(response.status).toBe(200);
  });
});

describe("handleUploads", () => {
  it("requires a session", async () => {
    const event = eventFor("/api/uploads");
    event.locals.user = null;
    const response = await handleUploads({ event, resolve: resolveOk() });

    expect(response.status).toBe(401);
    expect(handleUploadRequest).not.toHaveBeenCalled();
  });

  it("hands an upload to tus with the user id", async () => {
    handleUploadRequest.mockResolvedValue(new Response(null, { status: 201 }));
    const event = eventFor("/api/uploads", {
      origin: "https://anysub.example",
    });
    event.locals.user = user as App.Locals["user"];
    const response = await handleUploads({ event, resolve: resolveOk() });

    expect(response.status).toBe(201);
    expect(handleUploadRequest).toHaveBeenCalledWith(event.request, "user-1");
  });
});

describe("rejectCrossOriginRequests", () => {
  function postFor(path: string, headers: HeadersInit): RequestEvent {
    const url = new URL(path, "https://anysub.example");
    return {
      url,
      request: new Request(url, { method: "POST", headers }),
      locals: {},
    } as RequestEvent;
  }

  it("refuses a cross-site request before any other hook runs", async () => {
    const resolve = resolveOk();
    const response = await rejectCrossOriginRequests({
      event: postFor("/api/uploads", { "sec-fetch-site": "cross-site" }),
      resolve,
    });

    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("passes a same-origin request on", async () => {
    const response = await rejectCrossOriginRequests({
      event: postFor("/login", { "sec-fetch-site": "same-origin" }),
      resolve: resolveOk(),
    });

    expect(await response.text()).toBe("resolved");
  });
});

describe("logServerErrors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a 5xx and returns only the generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("password=hunter2");

    const body = logServerErrors({
      error: cause,
      event: eventFor("/api/projects/1/tracks/2"),
      status: 500,
      message: "Internal Error",
    });

    expect(body).toEqual({ message: "Internal Error" });
    expect(log).toHaveBeenCalledWith(
      "GET /api/projects/1/tracks/2 failed",
      cause,
    );
  });

  it("shows the public message of a server failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const body = logServerErrors({
      error: new ServerFailure("The track could not be saved.", {
        cause: new Error("password=hunter2"),
      }),
      event: eventFor("/api/projects/1/tracks/2"),
      status: 500,
      message: "Internal Error",
    });

    expect(body).toEqual({ message: "The track could not be saved." });
  });

  it("does not log a 404", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logServerErrors({
      error: new Error("Not found"),
      event: eventFor("/missing"),
      status: 404,
      message: "Not Found",
    });

    expect(log).not.toHaveBeenCalled();
  });
});
