import { withTransaction } from "$lib/server/db/transaction";
import type { SubtitleCueSnapshot } from "$lib/subtitles";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CUES = 25_000;
const MAX_CUE_TEXT = 20_000;
const MAX_TOTAL_TEXT = 10_000_000;

export class TrackRevisionConflict extends Error {
  constructor(readonly currentRevision: number) {
    super("The subtitle track changed in another editor.");
  }
}

export class TrackValidationError extends Error {}

export type TrackUpdate = {
  revision: number;
  cues: SubtitleCueSnapshot[];
};

export function parseTrackUpdate(value: unknown): TrackUpdate {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0
  ) {
    throw new Error("A valid track revision is required.");
  }
  if (!Array.isArray(value.cues) || value.cues.length > MAX_CUES) {
    throw new Error(
      `A track may contain at most ${MAX_CUES.toLocaleString()} cues.`,
    );
  }

  const ids = new Set<string>();
  let totalText = 0;
  const cues = value.cues.map((candidate, position) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !UUID.test(candidate.id)
    ) {
      throw new Error(`Cue ${position + 1} has an invalid ID.`);
    }
    if (ids.has(candidate.id)) throw new Error("Cue IDs must be unique.");
    ids.add(candidate.id);

    const startUs = Number(candidate.startUs);
    const endUs = Number(candidate.endUs);
    if (
      !Number.isSafeInteger(startUs) ||
      !Number.isSafeInteger(endUs) ||
      startUs < 0 ||
      endUs < startUs
    ) {
      throw new Error(`Cue ${position + 1} has invalid timing.`);
    }
    if (
      typeof candidate.text !== "string" ||
      candidate.text.length > MAX_CUE_TEXT
    ) {
      throw new Error(`Cue ${position + 1} has invalid text.`);
    }
    totalText += candidate.text.length;
    if (totalText > MAX_TOTAL_TEXT)
      throw new Error("The subtitle track is too large.");

    return {
      id: candidate.id,
      position,
      startUs,
      endUs,
      text: candidate.text.replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
    };
  });
  return { revision: Number(value.revision), cues };
}

export async function updateTrackForUser(
  projectId: string,
  trackId: string,
  userId: string,
  update: TrackUpdate,
): Promise<number | null> {
  return withTransaction(async (client) => {
    const track = await client.query<{
      revision: number;
      duration_us: number | null;
    }>(
      `select track.revision,
              case when track.metadata ? 'durationUs'
                then (track.metadata->>'durationUs')::bigint
                else p.media_duration_us
              end as duration_us
         from subtitle_tracks track
         join projects p on p.id = track.project_id
         join memberships m on m.workspace_id = p.workspace_id
        where track.id = $1 and p.id = $2 and m.user_id = $3
        for update of track`,
      [trackId, projectId, userId],
    );
    if (!track.rows[0]) return null;
    if (Number(track.rows[0].revision) !== update.revision) {
      throw new TrackRevisionConflict(Number(track.rows[0].revision));
    }
    const durationUs =
      track.rows[0].duration_us === null
        ? null
        : Number(track.rows[0].duration_us);
    if (
      durationUs !== null &&
      update.cues.some((cue) => cue.endUs > durationUs)
    ) {
      throw new TrackValidationError(
        "Cue timing cannot extend past the source duration.",
      );
    }

    const existing = await client.query<{
      id: string;
      text: string;
      words: Record<string, unknown>[];
    }>("select id, text, words from cues where track_id = $1", [trackId]);
    const existingById = new Map(existing.rows.map((cue) => [cue.id, cue]));
    const storedCues = update.cues.map((cue) => {
      const previous = existingById.get(cue.id);
      return {
        ...cue,
        words: previous?.text === cue.text ? previous.words : [],
      };
    });

    await client.query("delete from cues where track_id = $1", [trackId]);
    if (storedCues.length) {
      await client.query(
        `insert into cues (id, track_id, position, start_us, end_us, text, words)
         select value.id::uuid, $1, value.position, value.start_us,
                value.end_us, value.text, value.words
           from jsonb_to_recordset($2::jsonb) as value(
             id text, position integer, start_us bigint, end_us bigint,
             text text, words jsonb
           )`,
        [
          trackId,
          JSON.stringify(
            storedCues.map((cue) => ({
              id: cue.id,
              position: cue.position,
              start_us: cue.startUs,
              end_us: cue.endUs,
              text: cue.text,
              words: cue.words,
            })),
          ),
        ],
      );
    }
    const updated = await client.query<{ revision: number }>(
      `update subtitle_tracks
          set revision = revision + 1, updated_at = now()
        where id = $1
        returning revision`,
      [trackId],
    );
    return Number(updated.rows[0].revision);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
