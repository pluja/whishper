import type { PoolClient } from "pg";

export type CueInsert = {
  id?: string;
  startUs: number;
  endUs: number;
  text: string;
  words: unknown[];
};

export async function insertCues(
  client: PoolClient,
  trackId: string,
  cues: CueInsert[],
): Promise<void> {
  if (cues.length === 0) return;
  await client.query(
    `insert into cues (id, track_id, position, start_us, end_us, text, words)
     select coalesce(value.id::uuid, gen_random_uuid()), $1, value.position,
            value.start_us, value.end_us, value.text, value.words
       from jsonb_to_recordset($2::jsonb) as value(
         id text, position integer, start_us bigint, end_us bigint,
         text text, words jsonb
       )`,
    [
      trackId,
      JSON.stringify(
        cues.map((cue, position) => ({
          id: cue.id ?? null,
          position,
          start_us: cue.startUs,
          end_us: cue.endUs,
          text: cue.text,
          words: cue.words,
        })),
      ),
    ],
  );
}
