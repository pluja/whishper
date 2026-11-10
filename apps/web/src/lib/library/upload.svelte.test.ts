import type { HttpResponse, Upload } from "tus-js-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectUpload } from "./upload.svelte";

type UploadOptions = ConstructorParameters<typeof Upload>[1];

const tus = vi.hoisted(() => {
  class FakeUpload {
    static created: FakeUpload[] = [];
    options: UploadOptions;
    start = vi.fn();
    resumeFromPreviousUpload = vi.fn();
    abort = vi.fn((_shouldTerminate?: boolean) => Promise.resolve());

    constructor(_file: File, options: UploadOptions) {
      this.options = options;
      FakeUpload.created.push(this);
    }

    findPreviousUploads() {
      return Promise.resolve([]);
    }

    succeed(projectId?: string) {
      const lastResponse = {
        getHeader: (name: string) =>
          name === "Upload-Project" ? projectId : undefined,
      } as HttpResponse;
      this.options.onSuccess?.({ lastResponse });
    }
  }
  return { FakeUpload };
});

vi.mock("tus-js-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("tus-js-client")>()),
  Upload: tus.FakeUpload,
}));

const file = new File(["media"], "talk.mp4", { type: "video/mp4" });

function createUpload() {
  const events = { onUploaded: vi.fn(), onCancelled: vi.fn() };
  return { upload: new ProjectUpload(events), events };
}

function lastTusUpload() {
  const created = tus.FakeUpload.created.at(-1);
  if (!created) throw new Error("No tus upload was created");
  return created;
}

describe("ProjectUpload", () => {
  beforeEach(() => {
    tus.FakeUpload.created = [];
  });

  it("reports the created project once the upload succeeds", async () => {
    const { upload, events } = createUpload();
    await upload.start(file, "workspace", "Talk");

    lastTusUpload().succeed("project-1");

    expect(upload.status).toBe("success");
    expect(events.onUploaded).toHaveBeenCalledExactlyOnceWith("project-1");
  });

  it("tracks byte progress without changing the status message", async () => {
    const { upload } = createUpload();
    await upload.start(file, "workspace", "Talk");

    lastTusUpload().options.onProgress?.(25, 100);

    expect(upload.message).toBe("Uploading");
    expect(upload.progress).toBe(0.25);
  });

  it("reports a missing project header as no project", async () => {
    const { upload, events } = createUpload();
    await upload.start(file, "workspace", "Talk");

    lastTusUpload().succeed();

    expect(events.onUploaded).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("stops without discarding the server copy when disposed", async () => {
    const { upload, events } = createUpload();
    await upload.start(file, "workspace", "Talk");

    upload.dispose();
    lastTusUpload().succeed("project-1");

    expect(lastTusUpload().abort).toHaveBeenCalledExactlyOnceWith(false);
    expect(events.onUploaded).not.toHaveBeenCalled();
  });

  it("never starts an upload disposed while it looks for a previous one", async () => {
    const { upload } = createUpload();
    const starting = upload.start(file, "workspace", "Talk");

    upload.dispose();
    await starting;

    expect(lastTusUpload().start).not.toHaveBeenCalled();
  });

  it("stays busy while cancelling and ignores a second cancel", async () => {
    const { upload, events } = createUpload();
    await upload.start(file, "workspace", "Talk");
    let finishTermination = () => {};
    lastTusUpload().abort.mockReturnValueOnce(
      new Promise<void>((resolve) => (finishTermination = resolve)),
    );

    const cancelling = upload.cancel();
    await upload.cancel();

    expect(upload.status).toBe("cancelling");
    expect(upload.busy).toBe(true);
    expect(lastTusUpload().abort).toHaveBeenCalledExactlyOnceWith(true);

    finishTermination();
    await cancelling;

    expect(upload.status).toBe("idle");
    expect(upload.message).toBe("Upload cancelled");
    expect(events.onCancelled).toHaveBeenCalledOnce();
  });

  it("never starts an upload cancelled while it looks for a previous one", async () => {
    const { upload } = createUpload();
    const starting = upload.start(file, "workspace", "Talk");

    await upload.cancel();
    await starting;

    expect(lastTusUpload().start).not.toHaveBeenCalled();
    expect(upload.status).toBe("idle");
  });

  it("reports a cancel the server could not complete", async () => {
    const { upload, events } = createUpload();
    await upload.start(file, "workspace", "Talk");
    lastTusUpload().abort.mockRejectedValueOnce(new Error("offline"));

    await upload.cancel();

    expect(upload.status).toBe("error");
    expect(events.onCancelled).not.toHaveBeenCalled();
  });

  it("shows a plain message for a failed upload and allows a retry", async () => {
    const { upload } = createUpload();
    await upload.start(file, "workspace", "Talk");

    lastTusUpload().options.onError?.(new Error("tus: cannot read file"));

    expect(upload.status).toBe("error");
    expect(upload.message).toBe("The upload stopped. Try again to resume it.");
    expect(upload.busy).toBe(false);
  });

  it("does not upload again after a success", async () => {
    const { upload } = createUpload();
    await upload.start(file, "workspace", "Talk");
    lastTusUpload().succeed("project-1");

    await upload.start(file, "workspace", "Talk");

    expect(upload.busy).toBe(true);
    expect(tus.FakeUpload.created).toHaveLength(1);
  });
});
