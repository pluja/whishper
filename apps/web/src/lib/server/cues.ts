import type { PoolClient } from "pg";

import { isUuid } from "$lib/uuid";

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

export async function insertCues(
  client: PoolClient,
  trackId: string,
  batch: CueBatch,
): Promise<void> {
  if (batch.cues.length === 0) return;
  const rows = batch.cues.map((cue, position) => ({
    id: cueId(batch, cue),
    position,
    start_us: cue.startUs,
    end_us: cue.endUs,
    text: cue.text,
    words: cue.words,
  }));
  await client.query(
    `insert into cues (id, track_id, position, start_us, end_us, text, words)
     select coalesce(value.id, gen_random_uuid()), $1, value.position,
            value.start_us, value.end_us, value.text, value.words
       from jsonb_to_recordset($2::jsonb) as value(
         id uuid, position integer, start_us bigint, end_us bigint,
         text text, words jsonb
       )`,
    [trackId, JSON.stringify(rows)],
  );
}

function cueId(
  batch: CueBatch,
  cue: CueContent & { id?: string },
): string | null {
  if (batch.ids === "generate") return null;
  if (!isUuid(cue.id)) throw new Error("Cue ids must be UUIDs.");
  return cue.id;
}
