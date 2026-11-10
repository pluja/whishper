import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { cues, projects, subtitleTracks } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { projectForUser } from "$lib/server/projects/access";
import { insertCues, listTrackCues } from "$lib/server/subtitles/cues";
import { hasActiveTranscriptionRun } from "$lib/server/transcription/active-run";
import { isRecord } from "$lib/shared/is-record";
import { maxCueEndUs } from "$lib/shared/source-duration";
import type { SubtitleCueSnapshot } from "$lib/shared/subtitles";
import { isUuid } from "$lib/shared/uuid";

const MAX_CUES = 25_000;
const MAX_CUE_TEXT = 20_000;
const MAX_TOTAL_TEXT = 10_000_000;

export class TrackRevisionConflict extends Error {
  constructor(readonly currentRevision: number) {
    super("The subtitle track changed in another editor.");
  }
}

export class TrackLockedByTranscription extends Error {
  constructor() {
    super(
      "A new transcription is running for this project. Editing resumes when it finishes or is cancelled.",
    );
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
    throw new TrackValidationError("A valid track revision is required.");
  }
  if (!Array.isArray(value.cues) || value.cues.length > MAX_CUES) {
    throw new TrackValidationError(
      `A track may contain at most ${MAX_CUES.toLocaleString()} cues.`,
    );
  }

  const ids = new Set<string>();
  let totalText = 0;
  const cues = value.cues.map((candidate, position) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !isUuid(candidate.id)
    ) {
      throw new TrackValidationError(`Cue ${position + 1} has an invalid ID.`);
    }
    if (ids.has(candidate.id))
      throw new TrackValidationError("Cue IDs must be unique.");
    ids.add(candidate.id);

    const startUs = Number(candidate.startUs);
    const endUs = Number(candidate.endUs);
    if (
      !Number.isSafeInteger(startUs) ||
      !Number.isSafeInteger(endUs) ||
      startUs < 0 ||
      endUs < startUs
    ) {
      throw new TrackValidationError(`Cue ${position + 1} has invalid timing.`);
    }
    if (
      typeof candidate.text !== "string" ||
      candidate.text.length > MAX_CUE_TEXT
    ) {
      throw new TrackValidationError(`Cue ${position + 1} has invalid text.`);
    }
    // SQLite string functions and the subtitle exports stop at NUL, and an
    // unpaired surrogate has no UTF-8 encoding.
    if (candidate.text.includes("\u0000") || !candidate.text.isWellFormed()) {
      throw new TrackValidationError(
        `Cue ${position + 1} contains characters that cannot be saved. Retype its text.`,
      );
    }
    totalText += candidate.text.length;
    if (totalText > MAX_TOTAL_TEXT)
      throw new TrackValidationError("The subtitle track is too large.");

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

type StoredWord = Record<string, unknown>;

// Word timings stay true only while their cue keeps its text and its span. A
// cue moved as a whole carries its words along by the same distance.
function keptWords(
  previous: SubtitleCueSnapshot | undefined,
  cue: SubtitleCueSnapshot,
): StoredWord[] {
  if (!previous?.words || previous.text !== cue.text) return [];
  const shiftUs = cue.startUs - previous.startUs;
  if (cue.endUs - previous.endUs !== shiftUs) return [];
  return shiftUs === 0
    ? previous.words
    : previous.words.map((word) => shiftWord(word, shiftUs));
}

function shiftWord(word: StoredWord, shiftUs: number): StoredWord {
  const { startUs, endUs } = word;
  return typeof startUs === "number" && typeof endUs === "number"
    ? { ...word, startUs: startUs + shiftUs, endUs: endUs + shiftUs }
    : word;
}

export function updateTrackForUser(
  projectId: string,
  trackId: string,
  userId: string,
  update: TrackUpdate,
): number | null {
  return withTransaction((tx) => {
    if (!projectForUser(tx, projectId, userId)) return null;
    if (hasActiveTranscriptionRun(tx, projectId)) {
      throw new TrackLockedByTranscription();
    }
    const track = tx
      .select({
        revision: subtitleTracks.revision,
        metadata: subtitleTracks.metadata,
        mediaDurationUs: projects.mediaDurationUs,
      })
      .from(subtitleTracks)
      .innerJoin(projects, eq(projects.id, subtitleTracks.projectId))
      .where(and(eq(subtitleTracks.id, trackId), eq(projects.id, projectId)))
      .get();
    if (!track) return null;
    if (track.revision !== update.revision) {
      throw new TrackRevisionConflict(track.revision);
    }
    const maxEndUs = maxCueEndUs(
      track.mediaDurationUs,
      track.metadata.durationUs,
    );
    const lateCueIndex = update.cues.findIndex(
      (cue) => maxEndUs > 0 && cue.endUs > maxEndUs,
    );
    if (lateCueIndex >= 0) {
      throw new TrackValidationError(
        `Cue ${lateCueIndex + 1} ends after the source.`,
      );
    }

    const foreign = tx
      .select({ id: cues.id })
      .from(cues)
      .where(
        and(
          inArray(
            cues.id,
            update.cues.map((cue) => cue.id),
          ),
          ne(cues.trackId, trackId),
        ),
      )
      .limit(1)
      .get();
    if (foreign) {
      throw new TrackValidationError(
        "Some cues belong to another subtitle track. Reload the editor and try again.",
      );
    }
    const existingById = new Map(
      listTrackCues(tx, trackId, { includeWords: true }).map((cue) => [
        cue.id,
        cue,
      ]),
    );
    const storedCues = update.cues.map((cue) => ({
      ...cue,
      words: keptWords(existingById.get(cue.id), cue),
    }));

    tx.delete(cues).where(eq(cues.trackId, trackId)).run();
    insertCues(tx, trackId, { ids: "provided", cues: storedCues });
    return tx
      .update(subtitleTracks)
      .set({ revision: sql`${subtitleTracks.revision} + 1` })
      .where(eq(subtitleTracks.id, trackId))
      .returning({ revision: subtitleTracks.revision })
      .get().revision;
  });
}
