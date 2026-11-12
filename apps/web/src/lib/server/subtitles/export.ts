import { db } from "#lib/server/db/index.ts";
import { notFound } from "#lib/server/http/errors.ts";
import {
  requireMemberProject,
  type MemberProject,
} from "#lib/server/projects/access.ts";
import { listTrackCues } from "#lib/server/subtitles/cues.ts";
import { trackForProject } from "#lib/server/subtitles/tracks.ts";
import {
  isTrackExportFormat,
  type TrackExportFormat,
} from "#lib/shared/routes.ts";
import {
  renderPlainText,
  renderSrt,
  renderWebVtt,
  type SubtitleCueSnapshot,
  type SubtitleTrack,
} from "#lib/shared/subtitles.ts";

const JSON_EXPORT_SCHEMA_VERSION = "1.0";

export function exportTrackForUser(
  userId: string,
  projectId: string,
  trackId: string,
  format: string,
): Response {
  if (!isTrackExportFormat(format)) throw notFound("Unknown export format.");
  const project = requireMemberProject(db, projectId, userId);
  const track = trackForProject(db, projectId, trackId);
  if (!track) throw notFound("Track not found.");
  return trackExportResponse(
    format,
    project,
    track,
    listTrackCues(db, trackId, { includeWords: true }),
  );
}

function trackExportResponse(
  format: TrackExportFormat,
  project: Pick<MemberProject, "id" | "name">,
  track: SubtitleTrack,
  cues: SubtitleCueSnapshot[],
): Response {
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
}

function exportBody(
  format: TrackExportFormat,
  project: Pick<MemberProject, "id" | "name">,
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
