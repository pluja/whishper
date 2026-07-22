import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export function parseByteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export async function streamMediaFile(
  path: string,
  mediaType: string,
  request: Request,
): Promise<Response | null> {
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) return null;

  const range = parseByteRange(request.headers.get("range"), file.size);
  if (request.headers.has("range") && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${file.size}` },
    });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, file.size - 1);
  const stream = createReadStream(path, { start, end });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Length": String(Math.max(0, end - start + 1)),
    "Content-Type": mediaType,
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
