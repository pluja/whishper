import { DetailedError, type HttpRequest } from "tus-js-client";
import { describe, expect, it } from "vitest";

import { selectedFileProblem, uploadErrorMessage } from "./upload-messages";

const MIB = 1024 * 1024;

function tusFailure(method: string, status: number | null): DetailedError {
  const error = new DetailedError(
    "tus: unexpected response while uploading chunk, response code: 500",
  );
  error.originalRequest = { getMethod: () => method } as HttpRequest;
  error.originalResponse =
    status === null
      ? null
      : {
          getStatus: () => status,
          getHeader: () => undefined,
          getBody: () => "<html>Request Entity Too Large</html>",
          getUnderlyingObject: () => null,
        };
  return error;
}

function fileOf(size: number, type: string): File {
  return new File([new Uint8Array(size)], "recording", { type });
}

describe("selectedFileProblem", () => {
  it("accepts audio, video and files without a declared type", () => {
    expect(selectedFileProblem(fileOf(10, "audio/mpeg"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(10, "video/mp4"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(10, ""), MIB)).toBeNull();
  });

  it("rejects files that are not media", () => {
    expect(selectedFileProblem(fileOf(10, "application/pdf"), MIB)).toBe(
      "This is not an audio or video file.",
    );
  });

  it("rejects an empty file", () => {
    expect(selectedFileProblem(fileOf(0, "video/mp4"), MIB)).toBe(
      "This file is empty.",
    );
  });

  it("accepts a file at the limit and rejects one over it", () => {
    expect(selectedFileProblem(fileOf(MIB, "video/mp4"), MIB)).toBeNull();
    expect(selectedFileProblem(fileOf(2 * MIB, "video/mp4"), MIB)).toBe(
      "This file is 2.00 MiB, over the 1.00 MiB upload limit.",
    );
  });
});

describe("uploadErrorMessage", () => {
  it.each([
    [
      "a lost connection",
      tusFailure("PATCH", null),
      "The connection to the server was lost. Try again to resume the upload.",
    ],
    [
      "an ended session",
      tusFailure("PATCH", 401),
      "Your session has ended. Sign in again, then retry the upload.",
    ],
    [
      "a file over the limit",
      tusFailure("POST", 413),
      "This file is over the upload limit.",
    ],
    [
      "a chunk a proxy refused",
      tusFailure("PATCH", 413),
      "The server refused a part of the upload as too large. A reverse proxy in front of Anysub may need a higher request size limit.",
    ],
    [
      "an upload the server dropped",
      tusFailure("HEAD", 410),
      "The server no longer has this upload. Try again to start over.",
    ],
    [
      "a server failure",
      tusFailure("PATCH", 503),
      "The server could not store the upload. Try again in a moment.",
    ],
    [
      "any other refusal",
      tusFailure("PATCH", 400),
      "The server refused the upload. Reload the page and try again.",
    ],
    [
      "an error outside the protocol",
      new Error("tus: cannot read file"),
      "The upload stopped. Try again to resume it.",
    ],
  ])("explains %s without protocol details", (_case, error, message) => {
    expect(uploadErrorMessage(error)).toBe(message);
  });
});
