import { pool } from "$lib/server/db";
import {
  renderSrt,
  renderWebVtt,
  type SubtitleCueSnapshot,
} from "$lib/subtitles";
import { error, type RequestHandler } from "@sveltejs/kit";

type ExportTrack = {
  project_id: string;
  project_name: string;
  track_id: string;
  track_name: string;
  language: string;
  revision: number;
  metadata: Record<string, unknown>;
};

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401, "Authentication required");
  const format = params.format;
  if (!format || !["srt", "vtt", "json"].includes(format)) {
    error(404, "Export format not found");
  }

  const track = await pool.query<ExportTrack>(
    `select p.id as project_id, p.name as project_name,
            track.id as track_id, track.name as track_name,
            track.language, track.revision, track.metadata
       from subtitle_tracks track
       join projects p on p.id = track.project_id
       join memberships m on m.workspace_id = p.workspace_id
      where p.id = $1 and track.id = $2 and m.user_id = $3`,
    [params.projectId, params.trackId, locals.user.id],
  );
  if (!track.rows[0]) error(404, "Subtitle track not found");

  const cues = (
    await pool.query<{
      id: string;
      position: number;
      start_us: number;
      end_us: number;
      text: string;
      words: Record<string, unknown>[];
    }>(
      `select id, position, start_us, end_us, text, words
         from cues where track_id = $1 order by position asc`,
      [track.rows[0].track_id],
    )
  ).rows.map<SubtitleCueSnapshot>((cue) => ({
    id: cue.id,
    position: cue.position,
    startUs: Number(cue.start_us),
    endUs: Number(cue.end_us),
    text: cue.text,
    words: cue.words,
  }));

  const baseName = safeFilename(
    `${track.rows[0].project_name}-${track.rows[0].language}`,
  );
  const asciiName =
    baseName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]+/g, "-")
      .replace(/^-+|-+$/g, "") || "subtitles";
  const output = exportBody(format, track.rows[0], cues);
  return new Response(output.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${asciiName}.${format}"; filename*=UTF-8''${encodeURIComponent(`${baseName}.${format}`)}`,
      "Content-Type": output.contentType,
    },
  });
};

function exportBody(
  format: string,
  track: ExportTrack,
  cues: SubtitleCueSnapshot[],
) {
  if (format === "srt") {
    return {
      body: renderSrt(cues),
      contentType: "application/x-subrip; charset=utf-8",
    };
  }
  if (format === "vtt") {
    return { body: renderWebVtt(cues), contentType: "text/vtt; charset=utf-8" };
  }
  return {
    body: `${JSON.stringify(
      {
        schemaVersion: "1.0",
        project: { id: track.project_id, name: track.project_name },
        track: {
          id: track.track_id,
          name: track.track_name,
          language: track.language,
          revision: Number(track.revision),
          metadata: track.metadata,
        },
        cues,
      },
      null,
      2,
    )}\n`,
    contentType: "application/json; charset=utf-8",
  };
}

function safeFilename(value: string): string {
  return (
    value
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "subtitles"
  );
}
