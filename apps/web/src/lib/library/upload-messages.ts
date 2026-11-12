import { formatBytes } from "#lib/shared/format.ts";
import { isAcceptedMediaType } from "#lib/shared/media.ts";
import { DetailedError } from "tus-js-client";

export function selectedFileProblem(
  file: File,
  maxUploadBytes: number,
): string | null {
  if (!isAcceptedMediaType(file.type)) {
    return "This is not an audio or video file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxUploadBytes) {
    return `This file is ${formatBytes(file.size)}, over the ${formatBytes(maxUploadBytes)} upload limit.`;
  }
  return null;
}

export function uploadErrorMessage(error: Error): string {
  if (!(error instanceof DetailedError)) {
    return "The upload stopped. Try again to resume it.";
  }
  const response = error.originalResponse;
  if (!response) {
    return "The connection to the server was lost. Try again to resume the upload.";
  }
  const status = response.getStatus();
  if (status === 401) {
    return "Your session has ended. Sign in again, then retry the upload.";
  }
  if (status === 413) {
    // Creating an upload sends no data, so only Anysub's own limit rejects it.
    return error.originalRequest?.getMethod() === "POST"
      ? "This file is over the upload limit."
      : "The server refused a part of the upload as too large. A reverse proxy in front of Anysub may need a higher request size limit.";
  }
  if (status === 404 || status === 410) {
    return "The server no longer has this upload. Try again to start over.";
  }
  if (status >= 500) {
    return "The server could not store the upload. Try again in a moment.";
  }
  return "The server refused the upload. Reload the page and try again.";
}
