import { vi } from "vitest";

import type { EditorCue } from "./cues";
import { CueEditor } from "./editor.svelte";

export const trackA = { projectId: "project-a", trackId: "track-a" };
export const trackB = { projectId: "project-b", trackId: "track-b" };

export function cue(id: string, text: string): EditorCue {
  return { id, position: 0, start_us: 0, end_us: 1_000_000, text };
}

export function newEditor(
  readOnly = () => false,
  sourceDurationUs = 0,
): CueEditor {
  return new CueEditor({
    cues: [],
    maxLineLength: () => 42,
    readOnly,
    transport: {
      frameDurationUs: () => 40_000,
      preparedDurationUs: () => sourceDurationUs,
      trackDurationUs: () => 0,
    },
  });
}

// Autosave reaches for fetch, localStorage and timers, so editor tests run
// against fakes of all three.
export function stubEditorGlobals(): ReturnType<typeof vi.fn> {
  vi.useFakeTimers();
  const fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  return fetchMock;
}

export function restoreEditorGlobals(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
}
