import { asc, count, eq } from "drizzle-orm";

import type { ApiTrack, ApiTrackSummary } from "#lib/server/api/schemas.ts";
import { db, type Executor } from "#lib/server/db/index.ts";
import { cues, subtitleTracks } from "#lib/server/db/schema.ts";
import { notFound } from "#lib/server/http/errors.ts";
import { requireMemberProject } from "#lib/server/projects/access.ts";
import { listTrackCues } from "#lib/server/subtitles/cues.ts";
import { isRecord } from "#lib/shared/is-record.ts";

export function trackSummaries(
  executor: Executor,
  projectId: string,
): ApiTrackSummary[] {
  return executor
    .select({
      id: subtitleTracks.id,
      name: subtitleTracks.name,
      language: subtitleTracks.language,
      cueCount: count(cues.id),
      transcriptionId: subtitleTracks.sourceRunId,
      createdAt: subtitleTracks.createdAt,
    })
    .from(subtitleTracks)
    .leftJoin(cues, eq(cues.trackId, subtitleTracks.id))
    .where(eq(subtitleTracks.projectId, projectId))
    .groupBy(subtitleTracks.id)
    .orderBy(asc(subtitleTracks.createdAt))
    .all()
    .map((track) => ({ ...track, createdAt: track.createdAt.toISOString() }));
}

export function tracksForUser(
  userId: string,
  projectId: string,
): ApiTrackSummary[] {
  requireMemberProject(db, projectId, userId);
  return trackSummaries(db, projectId);
}

export function trackForUser(
  userId: string,
  projectId: string,
  trackId: string,
): ApiTrack {
  const summary = tracksForUser(userId, projectId).find(
    (track) => track.id === trackId,
  );
  if (!summary) throw notFound("Track not found.");
  return {
    ...summary,
    cues: listTrackCues(db, trackId, { includeWords: true }).map((cue) => ({
      id: cue.id,
      startUs: cue.startUs,
      endUs: cue.endUs,
      text: cue.text,
      words: (cue.words ?? []).flatMap(apiWord),
    })),
  };
}

// Words are stored as the worker sent them; only well-formed ones are listed.
function apiWord(
  word: Record<string, unknown>,
): ApiTrack["cues"][number]["words"] {
  if (
    !isRecord(word) ||
    typeof word.text !== "string" ||
    typeof word.startUs !== "number" ||
    typeof word.endUs !== "number"
  ) {
    return [];
  }
  return [
    {
      text: word.text,
      startUs: word.startUs,
      endUs: word.endUs,
      confidence: typeof word.confidence === "number" ? word.confidence : null,
    },
  ];
}
