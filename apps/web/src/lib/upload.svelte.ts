import { goto, invalidateAll } from "$app/navigation";
import { formatBytes } from "$lib/format";
import { Upload } from "tus-js-client";

export type UploadStatus = "idle" | "uploading" | "error" | "success";

export class ProjectUpload {
  status = $state<UploadStatus>("idle");
  progress = $state(0);
  message = $state("");
  #upload: Upload | null = null;

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
        this.progress = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0;
        this.message = `${formatBytes(bytesUploaded)} of ${formatBytes(bytesTotal)}`;
      },
      onError: (error) => {
        this.#fail(error.message || "The upload could not be completed.");
      },
      onSuccess: ({ lastResponse }) => {
        this.#upload = null;
        this.status = "success";
        this.progress = 1;
        this.message = "Upload complete";
        const projectId = lastResponse.getHeader("Upload-Project");
        if (projectId) void goto(`/projects/${projectId}`);
        else void invalidateAll();
      },
    });
    this.#upload = upload;
    try {
      const previous = await upload.findPreviousUploads();
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    } catch (error) {
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
      await invalidateAll();
    } catch (error) {
      this.#fail(
        error instanceof Error ? error.message : "Could not cancel the upload.",
      );
    }
  }

  #fail(message: string) {
    this.#upload = null;
    this.status = "error";
    this.message = message;
  }
}
