import { formatBytes } from "$lib/shared/format";
import { Upload } from "tus-js-client";

type UploadStatus = "idle" | "uploading" | "error" | "success";

type UploadEvents = {
  onUploaded: (projectId: string | null) => void;
  onCancelled: () => void;
};

export class ProjectUpload {
  status = $state<UploadStatus>("idle");
  progress = $state(0);
  message = $state("");
  #upload: Upload | null = null;
  #events: UploadEvents;

  constructor(events: UploadEvents) {
    this.#events = events;
  }

  get uploading(): boolean {
    return this.status === "uploading";
  }

  reset() {
    this.#upload = null;
    this.status = "idle";
    this.progress = 0;
    this.message = "";
  }

  async start(file: File, workspaceId: string, projectName: string) {
    if (this.uploading) return;
    this.status = "uploading";
    this.message = "Preparing resumable upload";
    const upload = new Upload(file, {
      endpoint: "/api/uploads",
      chunkSize: 32 * 1024 * 1024,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000, 20_000],
      removeFingerprintOnSuccess: true,
      metadata: {
        filename: file.name,
        filetype: file.type,
        workspaceId,
        projectName,
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!this.#isRunning(upload)) return;
        this.progress = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0;
        this.message = `${formatBytes(bytesUploaded)} of ${formatBytes(bytesTotal)}`;
      },
      onError: (error) => {
        if (!this.#isRunning(upload)) return;
        this.#fail(error.message || "The upload could not be completed.");
      },
      onSuccess: ({ lastResponse }) => {
        if (!this.#isRunning(upload)) return;
        this.#upload = null;
        this.status = "success";
        this.progress = 1;
        this.message = "Upload complete";
        this.#events.onUploaded(
          lastResponse.getHeader("Upload-Project") || null,
        );
      },
    });
    this.#upload = upload;
    try {
      const previous = await upload.findPreviousUploads();
      if (!this.#isRunning(upload)) return;
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    } catch (error) {
      if (!this.#isRunning(upload)) return;
      this.#fail(
        error instanceof Error ? error.message : "Could not start the upload.",
      );
    }
  }

  async cancel() {
    if (!this.#upload) return;
    try {
      await this.#upload.abort(true);
      this.reset();
      this.message = "Upload cancelled";
      this.#events.onCancelled();
    } catch (error) {
      this.#fail(
        error instanceof Error ? error.message : "Could not cancel the upload.",
      );
    }
  }

  // Leaves the upload on the server, so choosing the same file again resumes it.
  dispose() {
    const upload = this.#upload;
    this.#upload = null;
    void upload?.abort(false);
  }

  #isRunning(upload: Upload): boolean {
    return this.#upload === upload && this.uploading;
  }

  #fail(message: string) {
    this.#upload = null;
    this.status = "error";
    this.message = message;
  }
}
