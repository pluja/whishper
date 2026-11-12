import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { cues } from "#lib/server/db/schema.ts";
import type { SubtitleCueSnapshot } from "#lib/shared/subtitles.ts";
import { isUuid } from "#lib/shared/uuid.ts";

export type CueContent = {
  startUs: number;
  endUs: number;
  text: string;
  words: unknown[];
};

// Worker cue ids are adapter-local labels such as "cue-000001", never
// database identities, so transcripts always get server-generated ids.
export type CueBatch =
  | { ids: "generate"; cues: CueContent[] }
  | { ids: "provided"; cues: (CueContent & { id: string })[] };

// Large tracks are inserted in slices to stay under SQLite's limit on bound
// parameters per statement.
const INSERT_SLICE = 500;

export function insertCues(
  tx: Executor,
  trackId: string,
  batch: CueBatch,
): void {
  const rows = batch.cues.map((cue, position) => ({
    id: cueId(batch, cue),
    trackId,
    position,
    startUs: cue.startUs,
    endUs: cue.endUs,
    text: cue.text,
    words: cue.words as Record<string, unknown>[],
  }));
  for (let start = 0; start < rows.length; start += INSERT_SLICE) {
    tx.insert(cues)
      .values(rows.slice(start, start + INSERT_SLICE))
      .run();
  }
}

function cueId(batch: CueBatch, cue: CueContent & { id?: string }): string {
  if (batch.ids === "generate") return randomUUID();
  if (!isUuid(cue.id)) throw new Error("Cue ids must be UUIDs.");
  return cue.id;
}

// Words are opt-in: they can outweigh the cue text many times over.
export function listTrackCues(
  executor: Executor,
  trackId: string,
  { includeWords = false }: { includeWords?: boolean } = {},
): SubtitleCueSnapshot[] {
  const columns = {
    id: cues.id,
    position: cues.position,
    startUs: cues.startUs,
    endUs: cues.endUs,
    text: cues.text,
  };
  return executor
    .select(includeWords ? { ...columns, words: cues.words } : columns)
    .from(cues)
    .where(eq(cues.trackId, trackId))
    .orderBy(asc(cues.position))
    .all();
}
