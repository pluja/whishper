import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { pool } from "$lib/server/db";
import { resolveDataPath } from "$lib/server/media";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) error(401, "Authentication required");
  const media = await pool.query<{
    media_original_key: string;
    media_type: string | null;
  }>(
    `select p.media_original_key, upload.media_type
       from projects p
       join memberships m on m.workspace_id = p.workspace_id
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1 and m.user_id = $2 and p.media_original_key is not null`,
    [params.projectId, locals.user.id],
  );
  const source = media.rows[0];
  if (!source) error(404, "Media not found");

  const path = resolveDataPath(source.media_original_key);
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) error(404, "Media not found");

  const range = _parseByteRange(request.headers.get("range"), file.size);
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
    "Content-Type": source.media_type || "application/octet-stream",
  });
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
};

export function _parseByteRange(
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
