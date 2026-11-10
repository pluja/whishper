import { Upload } from "tus-js-client";
import { uploadErrorMessage } from "./upload-messages";

type UploadStatus = "idle" | "uploading" | "cancelling" | "error" | "success";

type UploadEvents = {
  onUploaded: (projectId: string | null) => void;
  onCancelled: () => void;
};

export class ProjectUpload {
  status = $state<UploadStatus>("idle");
  message = $state("");
  bytesUploaded = $state(0);
  bytesTotal = $state(0);
  #upload: Upload | null = null;
  #events: UploadEvents;

  constructor(events: UploadEvents) {
    this.#events = events;
  }

  get progress(): number {
    return this.bytesTotal > 0 ? this.bytesUploaded / this.bytesTotal : 0;
  }

  get uploading(): boolean {
    return this.status === "uploading";
  }

  // A finished upload stays busy, so one submit creates one project.
  get busy(): boolean {
    return (
      this.status === "uploading" ||
      this.status === "cancelling" ||
      this.status === "success"
    );
  }

  reset() {
    this.#upload = null;
    this.status = "idle";
    this.message = "";
    this.bytesUploaded = 0;
    this.bytesTotal = 0;
  }

  async start(file: File, workspaceId: string, projectName: string) {
    if (this.busy) return;
    this.status = "uploading";
    this.message = "Uploading";
    this.bytesUploaded = 0;
    this.bytesTotal = file.size;
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
        this.bytesUploaded = bytesUploaded;
        this.bytesTotal = bytesTotal;
      },
      onError: (error) => {
        if (this.#isRunning(upload)) this.#fail(uploadErrorMessage(error));
      },
      onSuccess: ({ lastResponse }) => {
        if (!this.#isRunning(upload)) return;
        this.#upload = null;
        this.status = "success";
        this.bytesUploaded = this.bytesTotal;
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
    } catch {
      if (this.#isRunning(upload)) {
        this.#fail("The upload could not start. Try again.");
      }
    }
  }

  async cancel() {
    const upload = this.#upload;
    if (!upload || !this.uploading) return;
    this.status = "cancelling";
    this.message = "Cancelling upload";
    try {
      await upload.abort(true);
    } catch {
      if (this.#upload !== upload) return;
      this.#fail("The upload stopped, but the server could not discard it.");
      return;
    }
    if (this.#upload !== upload) return;
    this.reset();
    this.message = "Upload cancelled";
    this.#events.onCancelled();
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
