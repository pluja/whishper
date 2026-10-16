import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Autosave } from "./autosave.svelte";
import type { EditorCue } from "./cues";

const track = { projectId: "project", trackId: "track" };
const journalKey = "anysub:editor:project:track";

type PendingPut = {
  revision: number;
  texts: string[];
  keepalive: boolean;
  respond(status: number, body: unknown): Promise<void>;
};

let puts: PendingPut[];
let storage: Map<string, string>;

function cue(text: string): EditorCue {
  return { id: "a", position: 0, start_us: 0, end_us: 1_000_000, text };
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Promise((resolve) => {
        puts.push({
          revision: body.revision,
          texts: body.cues.map((item: { text: string }) => item.text),
          keepalive: init.keepalive === true,
          async respond(status, responseBody) {
            resolve({
              status,
              ok: status >= 200 && status < 300,
              json: async () => {
                if (typeof responseBody === "string") {
                  throw new SyntaxError("Unexpected token '<'");
                }
                return responseBody;
              },
            });
            await vi.advanceTimersByTimeAsync(0);
          },
        });
      });
    }),
  );
}

function stubStorage(): void {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
}

function editorWith(text: string) {
  const source = { cues: [cue(text)] };
  const autosave = new Autosave(track, 1, () => source.cues);
  return {
    autosave,
    type(next: string) {
      source.cues = [cue(next)];
      autosave.markChanged();
    },
    replaceCues(next: string) {
      source.cues = [cue(next)];
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  puts = [];
  stubFetch();
  stubStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Autosave", () => {
  it("debounces edits into one save", async () => {
    const editor = editorWith("");
    editor.type("h");
    editor.type("hi");
    await vi.advanceTimersByTimeAsync(799);
    expect(puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(puts).toHaveLength(1);
    expect(editor.autosave.state).toBe("saving");
    await puts[0].respond(200, { revision: 2 });
    expect(editor.autosave.state).toBe("saved");
    expect(editor.autosave.hasUnsavedChanges).toBe(false);
  });

  it("never overlaps saves and resends with the new revision", async () => {
    const editor = editorWith("");
    editor.type("first");
    await vi.advanceTimersByTimeAsync(800);
    editor.type("first and more");
    void editor.autosave.flush();
    await vi.advanceTimersByTimeAsync(800);
    expect(puts).toHaveLength(1);
    expect(editor.autosave.state).toBe("saving");

    await puts[0].respond(200, { revision: 2 });
    expect(puts).toHaveLength(2);
    expect(puts[1]).toMatchObject({ revision: 2, texts: ["first and more"] });

    await puts[1].respond(200, { revision: 3 });
    expect(editor.autosave.state).toBe("saved");
    expect(storage.has(journalKey)).toBe(false);
  });

  it("waits for the debounce after an in flight save when typing continues", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    editor.type("ab");
    await puts[0].respond(200, { revision: 2 });
    expect(puts).toHaveLength(1);
    expect(editor.autosave.state).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(800);
    expect(puts[1]).toMatchObject({ revision: 2, texts: ["ab"] });
  });

  it("stops saving after a conflict", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(409, { message: "conflict" });
    expect(editor.autosave.state).toBe("conflict");
    editor.type("ab");
    await vi.advanceTimersByTimeAsync(5_000);
    await editor.autosave.flush();
    expect(puts).toHaveLength(1);
    expect(editor.autosave.state).toBe("conflict");
  });

  it("treats a non-JSON 409 as a conflict", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(409, "<html>Conflict</html>");
    expect(editor.autosave.state).toBe("conflict");
  });

  it("reports the status of a non-JSON gateway error and keeps the journal", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(502, "<html>Bad Gateway</html>");
    expect(editor.autosave.state).toBe("error");
    expect(editor.autosave.message).toBe("Save failed (HTTP 502).");
    expect(storage.has(journalKey)).toBe(true);
  });

  it("rejects a success response without a revision", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(200, "<html>Login</html>");
    expect(editor.autosave.state).toBe("error");
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });

  it("journals failed saves and retries on flush", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(500, { message: "Database down" });
    expect(editor.autosave.state).toBe("error");
    expect(editor.autosave.message).toBe("Database down");
    expect(JSON.parse(storage.get(journalKey)!)).toMatchObject({
      revision: 1,
      cues: [{ text: "a" }],
    });

    const retry = editor.autosave.flush();
    await puts[1].respond(200, { revision: 2 });
    await retry;
    expect(editor.autosave.state).toBe("saved");
    expect(storage.has(journalKey)).toBe(false);
  });

  it("journals and flushes with keepalive when leaving", async () => {
    const editor = editorWith("");
    editor.type("a");
    expect(editor.autosave.leave()).toBe(true);
    expect(JSON.parse(storage.get(journalKey)!).cues[0].text).toBe("a");
    expect(puts).toHaveLength(1);
    expect(puts[0].keepalive).toBe(true);
  });

  it("stops using keepalive once a cancelled unload keeps the page", async () => {
    const editor = editorWith("");
    editor.type("a");
    expect(editor.autosave.leave()).toBe(true);
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
    expect(puts[0].keepalive).toBe(true);
    await puts[0].respond(200, { revision: 2 });

    editor.type("ab");
    await vi.advanceTimersByTimeAsync(800);
    expect(puts[1].keepalive).toBe(false);
  });

  it("uses keepalive only for leaving and only under 64 KiB", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    expect(puts[0].keepalive).toBe(false);
    await puts[0].respond(200, { revision: 2 });

    editor.type("x".repeat(70 * 1024));
    editor.autosave.leave();
    expect(puts[1].keepalive).toBe(false);
  });

  it("reports that leaving would strand edits after a failure", async () => {
    const editor = editorWith("");
    editor.type("a");
    await vi.advanceTimersByTimeAsync(800);
    await puts[0].respond(500, {});
    editor.type("ab");
    await vi.advanceTimersByTimeAsync(800);
    await puts[1].respond(500, {});
    expect(editor.autosave.leave()).toBe(false);
    expect(puts).toHaveLength(2);
  });

  it("saves the cues present when disposed, not later ones", async () => {
    const editor = editorWith("");
    editor.type("kept");
    editor.autosave.dispose();
    editor.replaceCues("another track");
    expect(puts[0].texts).toEqual(["kept"]);
    await puts[0].respond(200, { revision: 2 });
    expect(editor.autosave.state).toBe("saved");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(puts).toHaveLength(1);
  });

  describe("recoverJournal", () => {
    function storeJournal(revision: number, cues: unknown[]): void {
      storage.set(journalKey, JSON.stringify({ revision, cues }));
    }

    it("restores a valid journal for the same revision and saves it", async () => {
      storeJournal(1, [cue("recovered")]);
      const editor = editorWith("server");
      const cues = editor.autosave.recoverJournal();
      expect(cues).toEqual([cue("recovered")]);
      expect(editor.autosave.state).toBe("unsaved");
      editor.replaceCues("recovered");
      await vi.advanceTimersByTimeAsync(1_200);
      expect(puts[0].texts).toEqual(["recovered"]);
    });

    it("discards a journal from another revision and says so", () => {
      storeJournal(7, [cue("old")]);
      const editor = editorWith("server");
      expect(editor.autosave.recoverJournal()).toBeNull();
      expect(editor.autosave.state).toBe("saved");
      expect(editor.autosave.message).toMatch(/older version.*discarded/);
      expect(storage.has(journalKey)).toBe(false);
    });

    it("survives storage that the browser blocks", async () => {
      const blocked = () => {
        throw new Error("SecurityError");
      };
      vi.stubGlobal("localStorage", {
        getItem: blocked,
        setItem: blocked,
        removeItem: blocked,
      });
      const editor = editorWith("");
      expect(editor.autosave.recoverJournal()).toBeNull();
      editor.type("a");
      await vi.advanceTimersByTimeAsync(800);
      await puts[0].respond(200, { revision: 2 });
      expect(editor.autosave.state).toBe("saved");
    });

    it("discards a journal with malformed cues", () => {
      storeJournal(1, [{ id: "a", text: "no times" }]);
      const editor = editorWith("server");
      expect(editor.autosave.recoverJournal()).toBeNull();
      expect(storage.has(journalKey)).toBe(false);
    });
  });
});
