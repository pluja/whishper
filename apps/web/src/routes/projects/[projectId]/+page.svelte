<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import { formatEditorTime, parseEditorTime } from "$lib/subtitles";

  interface EditorCue {
    id: string;
    position: number;
    start_us: number;
    end_us: number;
    text: string;
  }

  type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

  let { data, form } = $props();
  let selectedModelKey = $state(
    untrack(
      () =>
        (
          data.transcriptionModels.find((model) => model.modelId === "small") ??
          data.transcriptionModels[0]
        )?.key ?? "",
    ),
  );
  let selectedModel = $derived(
    data.transcriptionModels.find((model) => model.key === selectedModelKey),
  );
  let playbackUs = $state(0);
  let mediaDurationUs = $state(0);
  let mediaElement = $state<HTMLMediaElement>();
  let cues = $state<EditorCue[]>(
    untrack(() =>
      data.cues.map((cue) => ({
        ...cue,
        start_us: Number(cue.start_us),
        end_us: Number(cue.end_us),
      })),
    ),
  );
  let loadedTrackId = $state<string | null>(
    untrack(() => data.track?.id ?? null),
  );
  let revision = $state(Number(untrack(() => data.track?.revision ?? 0)));
  let selectedCueId = $state<string | null>(untrack(() => cues[0]?.id ?? null));
  let saveState = $state<SaveState>("saved");
  let editorMessage = $state("");
  let changeVersion = 0;
  let saveTimer: number | undefined;
  let journalTimer: number | undefined;
  let saveAgain = false;
  let editBaseline: EditorCue[] | null = null;
  let undoStack = $state<EditorCue[][]>([]);
  let redoStack = $state<EditorCue[][]>([]);
  const cursorPositions = new Map<string, number>();
  let maxLineLength = $derived(
    Number(data.track?.metadata?.maxLineLength ?? 42),
  );
  let sourceDurationUs = $derived(
    Number(data.track?.metadata?.durationUs ?? mediaDurationUs ?? 0),
  );
  let journalKey = $derived(
    data.track ? `anysub:editor:${data.project.id}:${data.track.id}` : "",
  );
  let activeCue = $derived(
    cues.find((cue) => cue.start_us <= playbackUs && cue.end_us >= playbackUs),
  );
  let selectedCueIndex = $derived(
    cues.findIndex((cue) => cue.id === selectedCueId),
  );
  let issueCount = $derived(
    cues.reduce((count, cue, index) => count + cueIssues(cue, index).length, 0),
  );

  $effect(() => {
    if (!data.track || data.track.id === loadedTrackId) return;
    loadedTrackId = data.track.id;
    cues = data.cues.map((cue) => ({
      ...cue,
      start_us: Number(cue.start_us),
      end_us: Number(cue.end_us),
    }));
    revision = Number(data.track.revision);
    selectedCueId = cues[0]?.id ?? null;
    saveState = "saved";
    undoStack = [];
    redoStack = [];
    queueMicrotask(recoverJournal);
  });

  onMount(() => {
    const interval =
      data.run && ["queued", "running"].includes(data.run.status)
        ? window.setInterval(() => {
            if (data.run && ["queued", "running"].includes(data.run.status)) {
              void invalidateAll();
            } else if (interval) {
              window.clearInterval(interval);
            }
          }, 1_500)
        : undefined;
    recoverJournal();
    const onKeydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      } else if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (
        event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        redo();
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "saved") return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      if (interval) window.clearInterval(interval);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (journalTimer) window.clearTimeout(journalTimer);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  });

  function timecode(microseconds: number): string {
    return formatEditorTime(microseconds);
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes;
    let unit = -1;
    do {
      value /= 1024;
      unit += 1;
    } while (value >= 1024 && unit < units.length - 1);
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  }

  function isAudioSource(): boolean {
    return (
      data.project.media_type?.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(
        data.project.media_filename ?? "",
      )
    );
  }

  function updatePlayback(event: Event): void {
    const media = event.currentTarget as HTMLMediaElement;
    playbackUs = Math.round(media.currentTime * 1_000_000);
    mediaDurationUs = Number.isFinite(media.duration)
      ? Math.round(media.duration * 1_000_000)
      : 0;
    const current = cues.find(
      (cue) => cue.start_us <= playbackUs && cue.end_us >= playbackUs,
    );
    if (
      current &&
      current.id !== selectedCueId &&
      !document.activeElement?.closest(".cue-editor")
    ) {
      selectedCueId = current.id;
      document
        .getElementById(`cue-${current.id}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }

  function seekTo(microseconds: number): void {
    if (!mediaElement) return;
    mediaElement.currentTime = microseconds / 1_000_000;
    void mediaElement.play();
  }

  function cueSnapshot(): EditorCue[] {
    return cues.map((cue) => ({ ...cue }));
  }

  function beginEdit(): void {
    editBaseline ??= cueSnapshot();
  }

  function finishEdit(): void {
    if (!editBaseline) return;
    if (JSON.stringify(editBaseline) !== JSON.stringify(cues)) {
      undoStack = [...undoStack.slice(-49), editBaseline];
      redoStack = [];
    }
    editBaseline = null;
  }

  function markChanged(): void {
    changeVersion += 1;
    saveState = "unsaved";
    editorMessage = "";
    scheduleJournal();
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNow(), 800);
  }

  function mutate(change: () => void): void {
    undoStack = [...undoStack.slice(-49), cueSnapshot()];
    redoStack = [];
    change();
    cues = cues.map((cue, position) => ({ ...cue, position }));
    markChanged();
  }

  function updateText(index: number, event: Event): void {
    cues[index].text = (event.currentTarget as HTMLTextAreaElement).value;
    cues = [...cues];
    markChanged();
  }

  function updateTime(
    index: number,
    field: "start_us" | "end_us",
    event: Event,
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseEditorTime(input.value);
    if (parsed === null) {
      input.setCustomValidity("Use HH:MM:SS.mmm or MM:SS.mmm.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    cues[index][field] = parsed;
    cues = [...cues];
    markChanged();
  }

  function rememberCursor(cueId: string, event: Event): void {
    cursorPositions.set(
      cueId,
      (event.currentTarget as HTMLTextAreaElement).selectionStart,
    );
  }

  function splitSelected(): void {
    if (selectedCueIndex < 0) return;
    const index = selectedCueIndex;
    const cue = cues[index];
    if (cue.end_us - cue.start_us < 200_000) {
      editorMessage = "This cue is too short to split.";
      return;
    }
    const splitUs =
      playbackUs > cue.start_us + 100_000 && playbackUs < cue.end_us - 100_000
        ? playbackUs
        : Math.round((cue.start_us + cue.end_us) / 2);
    const preferred =
      cursorPositions.get(cue.id) ??
      Math.round(
        cue.text.length *
          ((splitUs - cue.start_us) / (cue.end_us - cue.start_us)),
      );
    const textSplit = nearestWordBoundary(cue.text, preferred);
    if (textSplit <= 0 || textSplit >= cue.text.length) {
      editorMessage = "Place the text cursor between words before splitting.";
      return;
    }
    mutate(() => {
      const next: EditorCue = {
        id: crypto.randomUUID(),
        position: index + 1,
        start_us: splitUs,
        end_us: cue.end_us,
        text: cue.text.slice(textSplit).trim(),
      };
      cue.end_us = splitUs;
      cue.text = cue.text.slice(0, textSplit).trim();
      cues.splice(index + 1, 0, next);
      selectedCueId = next.id;
    });
  }

  function mergeSelected(): void {
    if (selectedCueIndex < 0 || selectedCueIndex >= cues.length - 1) return;
    const index = selectedCueIndex;
    mutate(() => {
      const cue = cues[index];
      const next = cues[index + 1];
      cue.end_us = Math.max(cue.end_us, next.end_us);
      cue.text = `${cue.text.trim()} ${next.text.trim()}`.trim();
      cues.splice(index + 1, 1);
    });
  }

  function insertAfterSelected(): void {
    const index = selectedCueIndex < 0 ? cues.length - 1 : selectedCueIndex;
    const previous = cues[index];
    const next = cues[index + 1];
    const start = previous?.end_us ?? 0;
    const availableEnd =
      next?.start_us ??
      (sourceDurationUs > start ? sourceDurationUs : start + 2_000_000);
    const end = Math.max(start, Math.min(start + 2_000_000, availableEnd));
    const cue: EditorCue = {
      id: crypto.randomUUID(),
      position: index + 1,
      start_us: start,
      end_us: end,
      text: "",
    };
    mutate(() => {
      cues.splice(index + 1, 0, cue);
      selectedCueId = cue.id;
    });
  }

  function deleteSelected(): void {
    if (selectedCueIndex < 0) return;
    const index = selectedCueIndex;
    mutate(() => {
      cues.splice(index, 1);
      selectedCueId = cues[Math.min(index, cues.length - 1)]?.id ?? null;
    });
  }

  function nudgeSelected(milliseconds: number): void {
    if (selectedCueIndex < 0) return;
    mutate(() => {
      const cue = cues[selectedCueIndex];
      const delta = milliseconds * 1_000;
      if (cue.start_us + delta < 0) {
        cue.end_us -= cue.start_us;
        cue.start_us = 0;
      } else {
        cue.start_us += delta;
        cue.end_us += delta;
      }
    });
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    if (!previous) return;
    redoStack = [...redoStack.slice(-49), cueSnapshot()];
    undoStack = undoStack.slice(0, -1);
    cues = previous;
    if (!cues.some((cue) => cue.id === selectedCueId)) {
      selectedCueId = cues[0]?.id ?? null;
    }
    markChanged();
  }

  function redo(): void {
    const next = redoStack.at(-1);
    if (!next) return;
    undoStack = [...undoStack.slice(-49), cueSnapshot()];
    redoStack = redoStack.slice(0, -1);
    cues = next;
    if (!cues.some((cue) => cue.id === selectedCueId)) {
      selectedCueId = cues[0]?.id ?? null;
    }
    markChanged();
  }

  async function saveNow(): Promise<void> {
    if (!data.track || saveState === "conflict") return;
    if (saveState === "saving") {
      saveAgain = true;
      return;
    }
    if (saveState === "saved") return;
    if (saveTimer) window.clearTimeout(saveTimer);
    const savedChangeVersion = changeVersion;
    saveState = "saving";
    try {
      const response = await fetch(
        `/api/projects/${data.project.id}/tracks/${data.track.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision,
            cues: cues.map((cue) => ({
              id: cue.id,
              startUs: cue.start_us,
              endUs: cue.end_us,
              text: cue.text,
            })),
          }),
        },
      );
      const result = await response.json();
      if (response.status === 409) {
        saveState = "conflict";
        editorMessage =
          "This track changed elsewhere. Reload before continuing.";
        return;
      }
      if (!response.ok) throw new Error(result.message ?? "Save failed.");
      revision = Number(result.revision);
      if (savedChangeVersion === changeVersion && !saveAgain) {
        saveState = "saved";
        window.localStorage.removeItem(journalKey);
      } else {
        saveAgain = false;
        saveState = "unsaved";
        persistJournal();
        saveTimer = window.setTimeout(() => void saveNow(), 50);
      }
    } catch (cause) {
      saveState = "error";
      editorMessage = cause instanceof Error ? cause.message : "Save failed.";
      persistJournal();
    }
  }

  function persistJournal(): void {
    if (!journalKey) return;
    try {
      window.localStorage.setItem(
        journalKey,
        JSON.stringify({
          revision,
          cues: cueSnapshot(),
          updatedAt: Date.now(),
        }),
      );
    } catch {
      editorMessage =
        "Browser recovery storage is full. Server autosave is still active.";
    }
  }

  function scheduleJournal(): void {
    if (journalTimer) window.clearTimeout(journalTimer);
    journalTimer = window.setTimeout(persistJournal, 120);
  }

  function recoverJournal(): void {
    if (!journalKey) return;
    try {
      const value = window.localStorage.getItem(journalKey);
      if (!value) return;
      const journal = JSON.parse(value);
      if (journal.revision !== revision || !Array.isArray(journal.cues)) return;
      cues = journal.cues;
      saveState = "unsaved";
      editorMessage = "Recovered unsaved changes from this browser.";
      changeVersion += 1;
      saveTimer = window.setTimeout(() => void saveNow(), 1_200);
    } catch {
      window.localStorage.removeItem(journalKey);
    }
  }

  function cueIssues(cue: EditorCue, index: number): string[] {
    const issues: string[] = [];
    const duration = (cue.end_us - cue.start_us) / 1_000_000;
    const characters = cue.text.replace(/\s/g, "").length;
    if (!cue.text.trim()) issues.push("Empty cue");
    if (cue.text.length > maxLineLength)
      issues.push(`Over ${maxLineLength} characters`);
    if (duration <= 0) issues.push("No duration");
    else {
      if (duration < 0.5) issues.push("Under 0.5 seconds");
      if (duration > 7) issues.push("Over 7 seconds");
      if (characters / duration > 20) issues.push("Over 20 CPS");
    }
    if (index > 0 && cues[index - 1].end_us > cue.start_us)
      issues.push("Overlaps previous cue");
    return issues;
  }

  function nearestWordBoundary(text: string, preferred: number): number {
    if (/\s/.test(text[preferred] ?? "")) return preferred;
    for (let distance = 1; distance < text.length; distance += 1) {
      if (/\s/.test(text[preferred - distance] ?? ""))
        return preferred - distance;
      if (/\s/.test(text[preferred + distance] ?? ""))
        return preferred + distance;
    }
    return -1;
  }

  function saveLabel(): string {
    if (saveState === "saving") return "Saving…";
    if (saveState === "unsaved") return "Unsaved changes";
    if (saveState === "error") return "Save failed";
    if (saveState === "conflict") return "Editing conflict";
    return "Saved";
  }
</script>

<svelte:head>
  <title>{data.project.name} · Anysub</title>
</svelte:head>

<div class="project-editor-page">
  <a class="breadcrumb" href="/">
    <Icon name="arrow-left" size={16} />
    Projects
  </a>

  <header class="project-header">
    <div>
      <p class="eyebrow">Subtitle project</p>
      <h1>{data.project.name}</h1>
      <p class="project-source-line">
        <span>{data.project.workspace_name}</span>
        {#if data.project.media_filename}
          <span>{data.project.media_filename}</span>
          {#if data.project.size_bytes}
            <span>{formatBytes(data.project.size_bytes)}</span>
          {/if}
        {:else}
          <span>Worker diagnostic</span>
        {/if}
      </p>
    </div>

    <div class="project-header-actions">
      {#if data.run}
        <span
          class="status large"
          data-status={data.run.job_state ?? data.run.status}
        >
          {data.run.status === "completed"
            ? "Transcript ready"
            : data.run.status}
        </span>
      {:else if data.project.media_original_key}
        <span class="status large" data-status="ready">Source ready</span>
      {/if}
      {#if data.project.can_manage}
        <form
          method="POST"
          action="?/deleteProject"
          onsubmit={(event) => {
            if (
              !confirm(
                "Delete this project, its source media, and every transcript? This cannot be undone.",
              )
            )
              event.preventDefault();
          }}
        >
          <button class="button danger quiet" type="submit"
            >Delete project</button
          >
        </form>
      {/if}
    </div>
  </header>

  {#if form?.message}
    <div class="alert error" role="alert">{form.message}</div>
  {/if}

  {#if data.run}
    {#if data.run.status === "queued" || data.run.status === "running"}
      <div class="processing-banner" aria-live="polite">
        <span class="processing-icon"><Icon name="activity" size={18} /></span>
        <div>
          <strong
            >{data.run.progress_message ??
              "Waiting for a compatible worker"}</strong
          >
          <progress value={data.run.progress ?? 0} max="1">
            {Math.round((data.run.progress ?? 0) * 100)}%
          </progress>
        </div>
        <span>{Math.round((data.run.progress ?? 0) * 100)}%</span>
      </div>
    {:else if data.run.status === "failed"}
      <div class="alert error" role="alert">
        <strong>Transcription failed</strong>
        <span
          >{String(data.run.error?.message ?? "The adapter run failed.")}</span
        >
      </div>
    {/if}
  {/if}

  <div class="editor-workspace">
    <section class="media-panel" aria-label="Subtitle preview">
      <header class="panel-toolbar">
        <div>
          <span class="panel-kicker">Preview</span>
          <strong>{data.project.media_filename ?? "Diagnostic source"}</strong>
        </div>
        <span class="preview-state">
          <span></span>
          {data.cues[0] ? "Track visible" : "Source stored"}
        </span>
      </header>

      <div class="media-canvas">
        {#if data.project.media_original_key}
          {#if isAudioSource()}
            <div class="audio-preview">
              <span><Icon name="audio" size={28} /></span>
              <strong>{data.project.media_filename}</strong>
              <audio
                bind:this={mediaElement}
                controls
                preload="metadata"
                src={`/api/projects/${data.project.id}/media`}
                ontimeupdate={updatePlayback}
                ondurationchange={updatePlayback}
              ></audio>
            </div>
          {:else}
            <video
              bind:this={mediaElement}
              class="media-player"
              controls
              preload="metadata"
              src={`/api/projects/${data.project.id}/media`}
              ontimeupdate={updatePlayback}
              ondurationchange={updatePlayback}
            >
              <track
                kind="captions"
                srclang={data.track?.language ?? "und"}
                label={`${data.track?.language ?? "Source"} captions`}
                src={`/api/projects/${data.project.id}/captions.vtt`}
              />
            </video>
          {/if}
        {:else}
          <div class="canvas-center" aria-hidden="true">
            <span><Icon name="play" size={24} /></span>
            <p>No source media is attached</p>
          </div>
        {/if}
        {#if activeCue}
          <p class="subtitle-overlay">{activeCue.text}</p>
        {/if}
      </div>

      <footer class="preview-footer">
        <span>{timecode(playbackUs)}</span>
        <div class="timeline" aria-hidden="true">
          <span
            style:width={`${mediaDurationUs ? (playbackUs / mediaDurationUs) * 100 : 0}%`}
          ></span>
        </div>
        <span
          >{mediaDurationUs ? timecode(mediaDurationUs) : "--:--:--.---"}</span
        >
      </footer>
    </section>

    <section class="transcript-panel" aria-label="Subtitle cues">
      <header class="panel-toolbar transcript-toolbar">
        <div>
          <span class="panel-kicker">Subtitle track</span>
          <strong>{data.track?.name ?? "Transcript"}</strong>
        </div>
        {#if data.track}
          <div class="track-summary">
            <span class="save-state" data-state={saveState} aria-live="polite">
              <span></span>{saveLabel()}
            </span>
            <span class="track-meta">
              {data.track.language} · {cues.length} cue{cues.length === 1
                ? ""
                : "s"}
            </span>
          </div>
        {/if}
      </header>

      {#if data.track}
        <div class="editor-toolbar" aria-label="Subtitle editing tools">
          <div class="tool-group">
            <button
              type="button"
              onclick={undo}
              disabled={!undoStack.length}
              title="Undo (Ctrl+Z)"
            >
              <Icon name="undo" size={15} /> Undo
            </button>
            <button
              type="button"
              onclick={redo}
              disabled={!redoStack.length}
              title="Redo (Ctrl+Y)"
            >
              <Icon name="redo" size={15} /> Redo
            </button>
          </div>
          <div class="tool-group">
            <button
              type="button"
              onclick={splitSelected}
              disabled={selectedCueIndex < 0}
            >
              <Icon name="scissors" size={15} /> Split
            </button>
            <button
              type="button"
              onclick={mergeSelected}
              disabled={selectedCueIndex < 0 ||
                selectedCueIndex >= cues.length - 1}
            >
              <Icon name="merge" size={15} /> Merge
            </button>
            <button type="button" onclick={insertAfterSelected}>
              <Icon name="plus" size={15} /> Insert
            </button>
            <button
              type="button"
              onclick={deleteSelected}
              disabled={selectedCueIndex < 0}
            >
              <Icon name="trash" size={15} /> Delete
            </button>
          </div>
          <div class="tool-group nudge-tools">
            <button
              type="button"
              onclick={() => nudgeSelected(-100)}
              disabled={selectedCueIndex < 0}
            >
              −100 ms
            </button>
            <button
              type="button"
              onclick={() => nudgeSelected(100)}
              disabled={selectedCueIndex < 0}
            >
              +100 ms
            </button>
          </div>
          <details class="export-menu">
            <summary><Icon name="download" size={15} /> Export</summary>
            <div>
              <a
                href={`/api/projects/${data.project.id}/tracks/${data.track.id}/export/srt`}
                download
              >
                <strong>SRT</strong><span>Universal subtitle file</span>
              </a>
              <a
                href={`/api/projects/${data.project.id}/tracks/${data.track.id}/export/vtt`}
                download
              >
                <strong>WebVTT</strong><span>Web video captions</span>
              </a>
              <a
                href={`/api/projects/${data.project.id}/tracks/${data.track.id}/export/json`}
                download
              >
                <strong>Anysub JSON</strong><span
                  >Cues, words, and metadata</span
                >
              </a>
            </div>
          </details>
          {#if data.project.can_manage}
            <form
              class="delete-track-form"
              method="POST"
              action="?/deleteTranscript"
              onsubmit={(event) => {
                if (
                  !confirm(
                    "Delete this transcript, its cues, and processing record? The source media will remain.",
                  )
                )
                  event.preventDefault();
              }}
            >
              <input type="hidden" name="trackId" value={data.track.id} />
              <button class="danger" type="submit" title="Delete transcript">
                <Icon name="trash" size={15} />
                <span class="visually-hidden">Delete transcript</span>
              </button>
            </form>
          {/if}
        </div>
        <div class="editor-statusbar">
          <span class:has-issues={issueCount > 0}>
            {issueCount > 0
              ? `${issueCount} quality warning${issueCount === 1 ? "" : "s"}`
              : "No timing or readability warnings"}
          </span>
          <span>Ctrl/⌘ S to save · Ctrl/⌘ Z to undo</span>
        </div>
        {#if editorMessage}
          <div
            class="editor-message"
            class:error={saveState === "error" || saveState === "conflict"}
          >
            <span>{editorMessage}</span>
            {#if saveState === "error"}
              <button type="button" onclick={() => void saveNow()}>Retry</button
              >
            {:else if saveState === "conflict"}
              <button type="button" onclick={() => location.reload()}
                >Reload</button
              >
            {/if}
          </div>
        {/if}
        <div class="cue-list">
          {#each cues as cue, index (cue.id)}
            <article
              id={`cue-${cue.id}`}
              class:active={activeCue?.id === cue.id}
              class:selected={selectedCueId === cue.id}
              class:invalid={cueIssues(cue, index).length > 0}
              class="cue-editor"
              onfocusin={() => (selectedCueId = cue.id)}
            >
              <div class="cue-gutter">
                <button
                  class="cue-index"
                  type="button"
                  onclick={() => {
                    selectedCueId = cue.id;
                    seekTo(cue.start_us);
                  }}
                  aria-label={`Play cue ${index + 1}`}
                >
                  {String(index + 1).padStart(2, "0")}
                </button>
                {#if cueIssues(cue, index).length}
                  <span
                    class="cue-warning"
                    title={cueIssues(cue, index).join(" · ")}>!</span
                  >
                {/if}
              </div>
              <div class="cue-fields">
                <div class="cue-time-fields">
                  <label>
                    <span>In</span>
                    <input
                      aria-label={`Cue ${index + 1} start time`}
                      value={timecode(cue.start_us)}
                      onfocus={beginEdit}
                      onchange={(event) => updateTime(index, "start_us", event)}
                      onblur={finishEdit}
                      spellcheck="false"
                    />
                  </label>
                  <span aria-hidden="true">→</span>
                  <label>
                    <span>Out</span>
                    <input
                      aria-label={`Cue ${index + 1} end time`}
                      value={timecode(cue.end_us)}
                      onfocus={beginEdit}
                      onchange={(event) => updateTime(index, "end_us", event)}
                      onblur={finishEdit}
                      spellcheck="false"
                    />
                  </label>
                  <span class="cue-duration"
                    >{((cue.end_us - cue.start_us) / 1_000_000).toFixed(
                      2,
                    )}s</span
                  >
                </div>
                <textarea
                  aria-label={`Cue ${index + 1} text`}
                  rows="2"
                  value={cue.text}
                  onfocus={beginEdit}
                  oninput={(event) => updateText(index, event)}
                  onselect={(event) => rememberCursor(cue.id, event)}
                  onclick={(event) => rememberCursor(cue.id, event)}
                  onkeyup={(event) => rememberCursor(cue.id, event)}
                  onblur={finishEdit}
                  spellcheck="true"
                ></textarea>
                <div class="cue-quality">
                  <span class:over-limit={cue.text.length > maxLineLength}>
                    {cue.text.length}/{maxLineLength} chars
                  </span>
                  {#if cue.end_us > cue.start_us}
                    <span
                      >{(
                        cue.text.replace(/\s/g, "").length /
                        ((cue.end_us - cue.start_us) / 1_000_000)
                      ).toFixed(1)} CPS</span
                    >
                  {/if}
                  {#each cueIssues(cue, index) as issue}
                    <span class="quality-tag">{issue}</span>
                  {/each}
                </div>
              </div>
            </article>
          {/each}
          {#if cues.length === 0}
            <div class="empty-cue-list">
              <strong>This track has no cues</strong>
              <p>Insert a cue to continue editing.</p>
              <button
                type="button"
                class="button compact"
                onclick={insertAfterSelected}>Insert first cue</button
              >
            </div>
          {/if}
        </div>
      {:else}
        <div class="transcript-empty">
          <span class="empty-illustration"
            ><Icon name="subtitles" size={28} /></span
          >
          {#if data.run && ["queued", "running"].includes(data.run.status)}
            <h2>Preparing the first track</h2>
            <p>
              The worker will place normalized subtitle cues here when
              processing finishes.
            </p>
          {:else if data.project.media_original_key}
            <h2>Ready to transcribe</h2>
            {#if data.transcriptionModels.length}
              <p>
                Choose the accuracy and resource profile for this source. The
                first run downloads its model into the private cache.
              </p>
              <form
                class="transcription-setup"
                method="POST"
                action="?/transcribe"
              >
                <label>
                  <span>Model</span>
                  <select name="model" bind:value={selectedModelKey} required>
                    {#each data.transcriptionModels as model}
                      <option value={model.key}
                        >{model.adapterName} · {model.displayName}</option
                      >
                    {/each}
                  </select>
                </label>
                {#if selectedModel?.description}
                  <span class="model-description"
                    >{selectedModel.description}</span
                  >
                {/if}
                <label>
                  <span>Spoken language</span>
                  <select name="language">
                    <option value="auto">Detect automatically</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="pl">Polish</option>
                    <option value="uk">Ukrainian</option>
                    <option value="el">Greek</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                  </select>
                </label>
                <label class="check-row">
                  <input name="alignment" type="checkbox" checked />
                  <span>
                    <strong>Accurate word alignment</strong>
                    <small
                      >Recommended for editing, highlights, and karaoke.</small
                    >
                  </span>
                </label>
                <details class="transcription-advanced">
                  <summary>Advanced options</summary>
                  <label>
                    <span>Maximum line length</span>
                    <input
                      name="maxLineLength"
                      type="number"
                      min="20"
                      max="120"
                      value="42"
                      required
                    />
                  </label>
                  <small
                    >42 characters is a readable subtitle default. Splits
                    preserve whole words.</small
                  >
                  <label>
                    <span>Batch size</span>
                    <input
                      name="batchSize"
                      type="number"
                      min="1"
                      max="64"
                      placeholder="Automatic"
                    />
                  </label>
                  <small
                    >Lower this only if the worker runs out of memory.</small
                  >
                </details>
                <button class="button wide" type="submit">
                  <Icon name="activity" size={16} />
                  Start transcription
                </button>
                <span class="empty-help"
                  >Processing stays on your connected worker. No media leaves
                  Anysub.</span
                >
              </form>
            {:else}
              <p>
                A transcription worker is not connected yet. Start or inspect
                the worker container, then this page will offer its models.
              </p>
              <button class="button wide" type="button" disabled>
                Waiting for a speech worker
              </button>
              <span class="empty-help">Model choices appear automatically.</span
              >
            {/if}
          {:else}
            <h2>No subtitle track</h2>
            <p>
              This project does not have source media or a transcription run.
            </p>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>
