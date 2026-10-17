import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { normalizeMediaType } from "$lib/shared/media";

export type ByteRange = { start: number; end: number };

export function safeMediaType(value: string | null | undefined): string {
  return normalizeMediaType(value) ?? "application/octet-stream";
}

/**
 * Returns null when the header must be ignored (absent, multi-range or
 * malformed, per RFC 9110) and "unsatisfiable" for a single range that selects
 * no bytes: a zero-length suffix or a start past the end.
 */
export function parseByteRange(
  value: string | null,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (suffixLength === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : null;
  if (requestedEnd !== null && requestedEnd < start) return null;
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  return { start, end: Math.min(requestedEnd ?? size - 1, size - 1) };
}

export async function streamMediaFile(
  path: string,
  mediaType: string,
  request: Request,
): Promise<Response | null> {
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return null;

  // The read stream closes the handle once it has been handed off.
  let streaming = false;
  try {
    const file = await handle.stat();
    if (!file.isFile()) return null;

    const range = parseByteRange(request.headers.get("range"), file.size);
    if (range === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? file.size - 1;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Length": String(Math.max(0, end - start + 1)),
      "Content-Type": mediaType,
      "X-Content-Type-Options": "nosniff",
    });
    if (range) {
      headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    }
    if (file.size === 0) return new Response(null, { status: 200, headers });

    const stream = handle.createReadStream({ start, end });
    streaming = true;
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    });
  } finally {
    if (!streaming) await handle.close().catch(() => undefined);
  }
}
