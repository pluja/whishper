import {
  projectForUser,
  type MemberProject,
} from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { db } from "$lib/server/db";
import { listTrackCues } from "$lib/server/subtitles/cues";
import { trackForProject } from "$lib/server/subtitles/tracks";
import {
  isTrackExportFormat,
  type TrackExportFormat,
} from "$lib/shared/routes";
import {
  renderPlainText,
  renderSrt,
  renderWebVtt,
  type SubtitleCueSnapshot,
  type SubtitleTrack,
} from "$lib/shared/subtitles";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const JSON_EXPORT_SCHEMA_VERSION = "1.0";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const format = params.format;
  if (!isTrackExportFormat(format)) {
    error(404, "Export format not found");
  }

  const project = projectForUser(db, params.projectId, user.id);
  if (!project) error(404, "Subtitle track not found");

  const track = trackForProject(db, project.id, params.trackId);
  if (!track) error(404, "Subtitle track not found");
  const cues = listTrackCues(db, track.id, { includeWords: true });

  const baseName = safeFilename(`${project.name}-${track.language}`);
  const asciiName =
    baseName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]+/g, "-")
      .replace(/^-+|-+$/g, "") || "subtitles";
  const output = exportBody(format, project, track, cues);
  return new Response(output.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${asciiName}.${format}"; filename*=UTF-8''${encodeURIComponent(`${baseName}.${format}`)}`,
      "Content-Type": output.contentType,
    },
  });
};

function exportBody(
  format: TrackExportFormat,
  project: MemberProject,
  track: SubtitleTrack,
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
  if (format === "txt") {
    return {
      body: renderPlainText(cues),
      contentType: "text/plain; charset=utf-8",
    };
  }
  return {
    body: `${JSON.stringify(
      {
        schemaVersion: JSON_EXPORT_SCHEMA_VERSION,
        project: { id: project.id, name: project.name },
        track: {
          id: track.id,
          name: track.name,
          language: track.language,
          revision: track.revision,
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
