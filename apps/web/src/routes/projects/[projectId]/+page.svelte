<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import Timeline from "$lib/components/studio/Timeline.svelte";
  import { formatEditorTime, parseEditorTime } from "$lib/subtitles";

  interface EditorCue {
    id: string;
    position: number;
    start_us: number;
    end_us: number;
    text: string;
  }

  interface TimelineTimingCommit {
    id: string;
    start_us: number;
    end_us: number;
  }
  interface ShortcutDefinition {
    id: string;
    keys: readonly string[];
    description: string;
  }

  interface ShortcutGroup {
    title: string;
    shortcuts: readonly ShortcutDefinition[];
  }

  type ShuttleDirection = -1 | 0 | 1;

  const DEFAULT_FRAME_DURATION_US = 40_000;
  const REVERSE_SHUTTLE_INTERVAL_MS = 40;
  const TEXT_ENTRY_TARGET_SELECTOR =
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
  const ACTIVATION_TARGET_SELECTOR =
    'button, a, summary, [role="button"], [role="link"]';
  const CUE_SCROLL_OPTIONS: ScrollIntoViewOptions = { block: "nearest" };
  const shortcutGroups: readonly ShortcutGroup[] = [
    {
      title: "Playback",
      shortcuts: [
        {
          id: "play-pause",
          keys: ["Space"],
          description: "Toggle play or pause",
        },
        {
          id: "reverse",
          keys: ["J"],
          description: "Shuttle backward at 1×, 2×, or 4×",
        },
        {
          id: "normal-playback",
          keys: ["K"],
          description: "Play forward at 1×",
        },
        {
          id: "forward",
          keys: ["L"],
          description: "Shuttle forward at 1×, 2×, or 4×",
        },
      ],
    },
    {
      title: "Navigation",
      shortcuts: [
        {
          id: "step-frame",
          keys: ["← / →"],
          description: "Step backward or forward one frame",
        },
        {
          id: "step-five-frames",
          keys: ["Shift", "← / →"],
          description: "Step backward or forward five frames",
        },
        {
          id: "cue-start",
          keys: ["↑ / ↓"],
          description: "Jump to the previous or next cue start",
        },
        {
          id: "source-edge",
          keys: ["Home / End"],
          description: "Go to the source start or end",
        },
      ],
    },
    {
      title: "Editing",
      shortcuts: [
        {
          id: "split",
          keys: ["Ctrl/Command", "K"],
          description: "Split the selected cue",
        },
        {
          id: "delete",
          keys: ["Shift", "Delete / Backspace"],
          description: "Deliberately delete the selected cue",
        },
        {
          id: "undo",
          keys: ["Ctrl/Command", "Z"],
          description: "Undo the last cue edit",
        },
        {
          id: "redo",
          keys: ["Ctrl/Command", "Shift", "Z"],
          description: "Redo the last edit; Ctrl/Command+Y also works",
        },
        {
          id: "save",
          keys: ["Ctrl/Command", "S"],
          description: "Save the current track",
        },
      ],
    },
  ];

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
  let modelPickerOpen = $state(false);
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
  let editorPaneWidth = $state(500);
  let paneResizeController: AbortController | undefined;
  const cursorPositions = new Map<string, number>();
  let shortcutGuide = $state<HTMLDialogElement>();
  let reverseShuttleTimer: number | undefined;
  let reverseShuttleLastTickMs = 0;
  let shuttleDirection: ShuttleDirection = 0;
  let shuttleRate = 1;
  let maxLineLength = $derived(
    Number(data.track?.metadata?.maxLineLength ?? 42),
  );
  let sourceDurationUs = $derived.by(() => {
    const preparedDurationUs = Number(data.project.media_duration_us ?? 0);
    if (Number.isSafeInteger(preparedDurationUs) && preparedDurationUs > 0) {
      return preparedDurationUs;
    }
    const trackDurationUs = Number(data.track?.metadata?.durationUs ?? 0);
    return Math.max(
      Number.isSafeInteger(trackDurationUs) && trackDurationUs > 0
        ? trackDurationUs
        : 0,
      mediaDurationUs,
    );
  });
  let waveformUrl = $derived(
    data.derivatives.find((derivative) => derivative.kind === "waveform")
      ?.url ?? null,
  );
  let proxyUrl = $derived(
    data.derivatives.find((derivative) => derivative.kind === "proxy")?.url ??
      null,
  );
  let thumbnailUrl = $derived(
    data.derivatives.find((derivative) => derivative.kind === "thumbnail")
      ?.url ?? null,
  );
  let previewUrl = $derived(
    proxyUrl ?? `/api/projects/${data.project.id}/media`,
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
    const storedPaneWidth = window.localStorage.getItem(
      "anysub:editor-pane-width",
    );
    if (storedPaneWidth !== null) {
      const parsedPaneWidth = Number(storedPaneWidth);
      if (Number.isFinite(parsedPaneWidth)) {
        editorPaneWidth = clampPaneWidth(parsedPaneWidth);
      }
    }
    const interval =
      (data.run && ["queued", "running"].includes(data.run.status)) ||
      (data.preparation &&
        ["queued", "leased"].includes(data.preparation.state))
        ? window.setInterval(() => {
            if (
              (data.run && ["queued", "running"].includes(data.run.status)) ||
              (data.preparation &&
                ["queued", "leased"].includes(data.preparation.state))
            ) {
              void invalidateAll();
            } else if (interval) {
              window.clearInterval(interval);
            }
          }, 1_500)
        : undefined;
    recoverJournal();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState === "saved") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      if (interval) window.clearInterval(interval);
      if (saveTimer) window.clearTimeout(saveTimer);
      if (journalTimer) window.clearTimeout(journalTimer);
      paneResizeController?.abort();
      resetShuttleRate();
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

  function formatRecommendedMemory(bytes: number | null | undefined): string {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
      return "Memory use unknown";
    }
    const gigabytes = bytes / 1024 ** 3;
    return `About ${Number(gigabytes.toFixed(1))} GB memory`;
  }

  function handleModelPickerToggle(event: ToggleEvent): void {
    modelPickerOpen = event.newState === "open";
  }

  function selectTranscriptionModel(modelKey: string): void {
    selectedModelKey = modelKey;
    document.getElementById("transcription-model-options")?.hidePopover();
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

  function isTextEntryTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest(TEXT_ENTRY_TARGET_SELECTOR) !== null
    );
  }

  function isFocusedActivationTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest(ACTIVATION_TARGET_SELECTOR) !== null
    );
  }

  function currentPlayheadUs(): number {
    if (!mediaElement || !Number.isFinite(mediaElement.currentTime)) {
      return playbackUs;
    }
    return Math.round(mediaElement.currentTime * 1_000_000);
  }

  function playbackEndUs(): number {
    if (
      mediaElement &&
      Number.isFinite(mediaElement.duration) &&
      mediaElement.duration > 0
    ) {
      return Math.round(mediaElement.duration * 1_000_000);
    }
    return sourceDurationUs;
  }

  function clearReverseShuttleTimer(): void {
    if (reverseShuttleTimer === undefined) return;
    window.clearInterval(reverseShuttleTimer);
    reverseShuttleTimer = undefined;
  }

  function resetShuttleRate(): void {
    clearReverseShuttleTimer();
    shuttleDirection = 0;
    shuttleRate = 1;
    if (mediaElement) mediaElement.playbackRate = 1;
  }

  function pauseAndResetPlayback(): boolean {
    if (!mediaElement) return false;
    resetShuttleRate();
    mediaElement.pause();
    return true;
  }

  function playForwardAtNormalRate(): boolean {
    if (!mediaElement) return false;
    resetShuttleRate();
    void mediaElement.play();
    return true;
  }

  function setPausedPlayhead(microseconds: number): boolean {
    if (!mediaElement) return false;
    pauseAndResetPlayback();
    const endUs = playbackEndUs();
    const boundedUs = Math.max(
      0,
      endUs > 0
        ? Math.min(Math.round(microseconds), endUs)
        : Math.round(microseconds),
    );
    mediaElement.currentTime = boundedUs / 1_000_000;
    playbackUs = boundedUs;
    return true;
  }

  function nextShuttleRate(rate: number): number {
    if (rate === 1) return 2;
    if (rate === 2) return 4;
    return 1;
  }

  function stepReverseShuttle(): void {
    if (!mediaElement || reverseShuttleTimer === undefined) {
      resetShuttleRate();
      return;
    }
    const now = performance.now();
    const elapsedMs = Math.max(0, now - reverseShuttleLastTickMs);
    reverseShuttleLastTickMs = now;
    const nextUs = Math.max(
      0,
      currentPlayheadUs() - Math.round(elapsedMs * 1_000 * shuttleRate),
    );
    mediaElement.currentTime = nextUs / 1_000_000;
    playbackUs = nextUs;
    if (nextUs === 0) {
      mediaElement.pause();
      resetShuttleRate();
    }
  }

  function togglePlayback(): boolean {
    if (!mediaElement) return false;
    const wasPlaying =
      reverseShuttleTimer !== undefined || !mediaElement.paused;
    resetShuttleRate();
    if (wasPlaying) {
      mediaElement.pause();
    } else {
      void mediaElement.play();
    }
    return true;
  }

  function startReverseShuttle(): boolean {
    if (!mediaElement) return false;
    shuttleRate = shuttleDirection === -1 ? nextShuttleRate(shuttleRate) : 1;
    shuttleDirection = -1;
    clearReverseShuttleTimer();
    mediaElement.pause();
    mediaElement.playbackRate = 1;
    playbackUs = currentPlayheadUs();
    if (playbackUs <= 0) {
      playbackUs = 0;
      mediaElement.currentTime = 0;
      resetShuttleRate();
      return true;
    }
    reverseShuttleLastTickMs = performance.now();
    reverseShuttleTimer = window.setInterval(
      stepReverseShuttle,
      REVERSE_SHUTTLE_INTERVAL_MS,
    );
    return true;
  }

  function startForwardShuttle(): boolean {
    if (!mediaElement) return false;
    shuttleRate = shuttleDirection === 1 ? nextShuttleRate(shuttleRate) : 1;
    shuttleDirection = 1;
    clearReverseShuttleTimer();
    mediaElement.playbackRate = shuttleRate;
    void mediaElement.play();
    return true;
  }

  function frameDurationUs(): number {
    const numerator = Number(data.project.media_frame_rate_num);
    const denominator = Number(data.project.media_frame_rate_den);
    if (
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      numerator <= 0 ||
      denominator <= 0
    ) {
      return DEFAULT_FRAME_DURATION_US;
    }
    return Math.round((1_000_000 * denominator) / numerator);
  }

  function stepFrames(direction: -1 | 1, frameCount: number): boolean {
    if (!mediaElement) return false;
    return setPausedPlayhead(
      currentPlayheadUs() + direction * frameCount * frameDurationUs(),
    );
  }

  function jumpToCueStart(direction: -1 | 1): boolean {
    if (!mediaElement) return false;
    const playheadUs = currentPlayheadUs();
    let destination: EditorCue | undefined;
    for (const cue of cues) {
      if (
        direction === -1 &&
        cue.start_us < playheadUs &&
        (!destination || cue.start_us > destination.start_us)
      ) {
        destination = cue;
      } else if (
        direction === 1 &&
        cue.start_us > playheadUs &&
        (!destination || cue.start_us < destination.start_us)
      ) {
        destination = cue;
      }
    }
    if (!destination) return false;
    setPausedPlayhead(destination.start_us);
    selectedCueId = destination.id;
    document
      .getElementById(`cue-${destination.id}`)
      ?.scrollIntoView(CUE_SCROLL_OPTIONS);
    return true;
  }

  function goToSourceEdge(end: boolean): boolean {
    if (!mediaElement) return false;
    if (!end) return setPausedPlayhead(0);
    const endUs = playbackEndUs();
    return endUs > 0 && setPausedPlayhead(endUs);
  }

  function openShortcutGuide(): void {
    if (shortcutGuide && !shortcutGuide.open) shortcutGuide.showModal();
  }

  function handleStudioKeydown(event: KeyboardEvent): void {
    if (shortcutGuide?.open || event.defaultPrevented) return;

    const key = event.key.toLowerCase();
    if (
      event.repeat &&
      (event.key === " " || key === "j" || key === "k" || key === "l")
    ) {
      return;
    }

    const commandKey = event.ctrlKey || event.metaKey;
    if (commandKey && !event.altKey) {
      if (!event.shiftKey && key === "s" && data.track) {
        event.preventDefault();
        void saveNow();
        return;
      }
      if (!event.shiftKey && key === "z" && undoStack.length > 0) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y")) &&
        redoStack.length > 0
      ) {
        event.preventDefault();
        redo();
        return;
      }
      if (!event.shiftKey && key === "k" && selectedCueIndex >= 0) {
        event.preventDefault();
        splitSelected();
      }
      return;
    }

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTextEntryTarget(event.target)
    ) {
      return;
    }
    if (event.key === " " && isFocusedActivationTarget(event.target)) return;

    let handled = false;
    if (!event.shiftKey && event.key === " ") {
      handled = togglePlayback();
    } else if (!event.shiftKey && key === "j") {
      handled = startReverseShuttle();
    } else if (!event.shiftKey && key === "k") {
      handled = playForwardAtNormalRate();
    } else if (!event.shiftKey && key === "l") {
      handled = startForwardShuttle();
    } else if (event.key === "ArrowLeft") {
      handled = stepFrames(-1, event.shiftKey ? 5 : 1);
    } else if (event.key === "ArrowRight") {
      handled = stepFrames(1, event.shiftKey ? 5 : 1);
    } else if (!event.shiftKey && event.key === "ArrowUp") {
      handled = jumpToCueStart(-1);
    } else if (!event.shiftKey && event.key === "ArrowDown") {
      handled = jumpToCueStart(1);
    } else if (!event.shiftKey && event.key === "Home") {
      handled = goToSourceEdge(false);
    } else if (!event.shiftKey && event.key === "End") {
      handled = goToSourceEdge(true);
    } else if (
      event.shiftKey &&
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedCueIndex >= 0
    ) {
      deleteSelected();
      handled = true;
    } else if (event.key === "?") {
      openShortcutGuide();
      handled = true;
    }

    if (handled) event.preventDefault();
  }

  function seekTo(microseconds: number): void {
    if (!mediaElement) return;
    mediaElement.currentTime = microseconds / 1_000_000;
    playbackUs = Math.round(microseconds);
  }

  function selectTimelineCue(cueId: string): void {
    if (cues.some((cue) => cue.id === cueId)) selectedCueId = cueId;
  }

  function commitTimelineTiming(change: TimelineTimingCommit): void {
    const cue = cues.find((item) => item.id === change.id);
    if (!cue) return;
    const startUs = Math.round(change.start_us);
    const endUs = Math.round(change.end_us);
    if (cue.start_us === startUs && cue.end_us === endUs) return;
    mutate(() => {
      cue.start_us = startUs;
      cue.end_us = endUs;
    });
  }

  function clampPaneWidth(width: number): number {
    if (typeof window === "undefined") return width;
    return Math.min(
      Math.max(width, 360),
      Math.min(760, window.innerWidth * 0.52),
    );
  }

  function beginPaneResize(event: PointerEvent): void {
    if (window.innerWidth <= 928) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = editorPaneWidth;
    const separator = event.currentTarget as HTMLElement;
    separator.setPointerCapture(event.pointerId);
    paneResizeController?.abort();
    paneResizeController = new AbortController();
    document.body.classList.add("resizing-studio-pane");

    window.addEventListener(
      "pointermove",
      (moveEvent) => {
        editorPaneWidth = clampPaneWidth(
          startWidth + startX - moveEvent.clientX,
        );
      },
      { signal: paneResizeController.signal },
    );
    window.addEventListener(
      "pointerup",
      () => {
        window.localStorage.setItem(
          "anysub:editor-pane-width",
          String(Math.round(editorPaneWidth)),
        );
        document.body.classList.remove("resizing-studio-pane");
        paneResizeController?.abort();
      },
      { once: true, signal: paneResizeController.signal },
    );
  }

  function resizePaneWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    editorPaneWidth = clampPaneWidth(
      editorPaneWidth + (event.key === "ArrowLeft" ? 24 : -24),
    );
    window.localStorage.setItem(
      "anysub:editor-pane-width",
      String(Math.round(editorPaneWidth)),
    );
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

<svelte:window onkeydown={handleStudioKeydown} />

<div class="project-editor-page">
  <header class="studio-titlebar">
    <a class="studio-back" href="/" aria-label="Back to projects">
      <Icon name="arrow-left" size={17} />
    </a>
    <div class="studio-identity">
      <strong>{data.project.name}</strong>
      <span>{data.project.media_filename ?? "Worker diagnostic"}</span>
    </div>
    <div class="studio-context">
      <span>{data.project.workspace_name}</span>
      {#if data.project.size_bytes}
        <span>{formatBytes(data.project.size_bytes)}</span>
      {/if}
      {#if data.track}
        <span>{data.track.language.toUpperCase()} · {cues.length} cues</span>
      {/if}
      {#if data.project.media_frame_rate_num && data.project.media_frame_rate_den}
        <span
          >{(
            data.project.media_frame_rate_num /
            data.project.media_frame_rate_den
          ).toFixed(3)} fps</span
        >
      {/if}
    </div>
    <div class="studio-actions">
      <button
        class="shortcut-guide-button"
        type="button"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        onclick={openShortcutGuide}
      >
        <span aria-hidden="true">?</span><span>Shortcuts</span>
      </button>
      {#if data.track}
        <span class="save-state" data-state={saveState} aria-live="polite">
          <span></span>{saveLabel()}
        </span>
        <details class="export-menu studio-export">
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
              <strong>Anysub JSON</strong><span>Cues, words, and metadata</span>
            </a>
          </div>
        </details>
      {/if}
      {#if data.project.can_manage}
        <details class="project-menu">
          <summary aria-label="Project actions" title="Project actions">
            <Icon name="more" size={18} />
          </summary>
          <div>
            {#if data.track}
              <form
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
                <button type="submit">Delete transcript</button>
              </form>
            {/if}
            <form class="media-action" method="POST" action="?/prepareMedia">
              <button type="submit">
                {data.project.media_preparation_status === "completed"
                  ? "Regenerate media derivatives"
                  : "Prepare media"}
              </button>
            </form>
            {#each data.derivatives as derivative (derivative.kind)}
              <form
                method="POST"
                action="?/deleteDerivative"
                onsubmit={(event) => {
                  if (
                    !confirm(
                      `Delete the ${derivative.kind} derivative? The source media will remain.`,
                    )
                  )
                    event.preventDefault();
                }}
              >
                <input type="hidden" name="kind" value={derivative.kind} />
                <button type="submit"
                  >Delete {derivative.kind} derivative</button
                >
              </form>
            {/each}
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
              <button type="submit">Delete project</button>
            </form>
          </div>
        </details>
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
          <span class="processing-stage">Transcription</span>
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

  {#if data.preparation && (data.preparation.state === "queued" || data.preparation.state === "leased")}
    <div class="processing-banner" aria-live="polite">
      <span class="processing-icon"><Icon name="activity" size={18} /></span>
      <div>
        <span class="processing-stage">Media preparation</span>
        <strong
          >{data.preparation.progress_message ??
            "Waiting for a media worker"}</strong
        >
        <progress value={data.preparation.progress ?? 0} max="1">
          {Math.round((data.preparation.progress ?? 0) * 100)}%
        </progress>
      </div>
      <div class="media-preparation-progress-actions">
        <span>{Math.round((data.preparation.progress ?? 0) * 100)}%</span>
        <form method="POST" action="?/cancelMedia">
          <button type="submit">Cancel</button>
        </form>
      </div>
    </div>
  {:else if data.project.media_preparation_status === "failed"}
    <div class="alert error media-preparation-error" role="alert">
      <div>
        <strong>Media preparation failed</strong>
        <span
          >{String(
            data.preparation?.error?.message ??
              "The source could not be prepared for editing.",
          )}</span
        >
      </div>
      <form method="POST" action="?/prepareMedia">
        <button type="submit">Retry preparation</button>
      </form>
    </div>
  {/if}
  <div
    class="editor-workspace"
    style:--editor-pane-width={`${editorPaneWidth}px`}
  >
    <section class="media-panel" aria-label="Subtitle preview">
      <header class="panel-toolbar">
        <div>
          <span class="panel-kicker">Program monitor</span>
          <strong>{data.project.media_filename ?? "Diagnostic source"}</strong>
        </div>
        <span
          class="preview-state"
          data-state={data.project.media_preparation_status}
        >
          <span></span>
          {proxyUrl
            ? "Editing proxy"
            : data.project.media_preparation_status === "completed"
              ? "Source prepared"
              : data.cues[0]
                ? "Track visible"
                : "Source stored"}
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
                src={previewUrl}
                onkeydowncapture={handleStudioKeydown}
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
              src={previewUrl}
              poster={thumbnailUrl ?? undefined}
              onkeydowncapture={handleStudioKeydown}
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

      <Timeline
        durationUs={sourceDurationUs}
        probeState={data.project.media_preparation_status}
        {waveformUrl}
        {cues}
        {selectedCueId}
        {playbackUs}
        onseek={seekTo}
        onselect={selectTimelineCue}
        oncommittiming={commitTimelineTiming}
      />
    </section>

    <button
      class="studio-divider"
      type="button"
      aria-label="Resize subtitle panel with the left and right arrow keys"
      onpointerdown={beginPaneResize}
      onkeydown={resizePaneWithKeyboard}
    >
      <span></span>
    </button>

    <section class="transcript-panel" aria-label="Subtitle cues">
      <header class="panel-toolbar transcript-toolbar">
        <div>
          <span class="panel-kicker">Text</span>
          <strong>{data.track?.name ?? "Transcript"}</strong>
        </div>
        {#if data.track}
          <div class="track-summary">
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
              <Icon name="undo" size={15} />
              <span class="visually-hidden">Undo</span>
            </button>
            <button
              type="button"
              onclick={redo}
              disabled={!redoStack.length}
              title="Redo (Ctrl+Y)"
            >
              <Icon name="redo" size={15} />
              <span class="visually-hidden">Redo</span>
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
              title="Delete selected cue"
            >
              <Icon name="trash" size={15} />
              <span class="visually-hidden">Delete selected cue</span>
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
                  {#each cueIssues(cue, index) as issue (issue)}
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
                <div class="model-picker-field">
                  <span id="transcription-model-label">Model</span>
                  <input type="hidden" name="model" value={selectedModelKey} />
                  <button
                    class="model-picker-trigger"
                    type="button"
                    popovertarget="transcription-model-options"
                    aria-haspopup="dialog"
                    aria-expanded={modelPickerOpen}
                    aria-controls="transcription-model-options"
                    aria-labelledby="transcription-model-label transcription-model-selection"
                    aria-describedby="transcription-model-selection-fit transcription-model-selection-description"
                  >
                    <span class="model-picker-selection">
                      <span class="model-picker-primary">
                        <strong id="transcription-model-selection">
                          {selectedModel?.displayName ?? "Choose a model"}
                        </strong>
                        <span
                          class="model-picker-fit"
                          id="transcription-model-selection-fit"
                          data-fit={selectedModel?.fit ?? "unknown"}
                        >
                          <span
                            class="model-fit-dot"
                            data-fit={selectedModel?.fit ?? "unknown"}
                            aria-hidden="true"
                          ></span>
                          <span>{selectedModel?.fitLabel ?? "Not checked"}</span
                          >
                        </span>
                      </span>
                      <span
                        class="model-picker-description"
                        id="transcription-model-selection-description"
                      >
                        {selectedModel?.description ??
                          "Description unavailable."}
                      </span>
                    </span>
                    <Icon name="chevron-down" size={18} />
                  </button>
                  <ul
                    class="model-picker-hardware-list"
                    aria-label="Detected hardware"
                  >
                    {#each data.detectedHardware as hardware (hardware)}
                      <li class="model-picker-hardware-card">
                        <span class="model-picker-hardware-icon">
                          <Icon name="cpu" size={16} />
                        </span>
                        <span class="model-picker-hardware-copy">
                          <span class="model-picker-hardware-eyebrow">
                            Detected hardware
                            <span>{hardware.kind}</span>
                          </span>
                          <strong class="model-picker-hardware-name">
                            {hardware.name}
                          </strong>
                          <span class="model-picker-hardware-specs">
                            {hardware.details.length
                              ? hardware.details.join(" · ")
                              : "Details unavailable"}
                          </span>
                        </span>
                      </li>
                    {:else}
                      <li class="model-picker-hardware-card">
                        <span class="model-picker-hardware-icon">
                          <Icon name="cpu" size={16} />
                        </span>
                        <span class="model-picker-hardware-copy">
                          <span class="model-picker-hardware-eyebrow">
                            Detected hardware
                          </span>
                          <strong class="model-picker-hardware-name">
                            Details unavailable
                          </strong>
                          <span class="model-picker-hardware-specs">
                            CPU and GPU details were not reported.
                          </span>
                        </span>
                      </li>
                    {/each}
                  </ul>
                  <div
                    class="model-picker-popover"
                    id="transcription-model-options"
                    popover
                    role="dialog"
                    aria-labelledby="transcription-model-dialog-title"
                    aria-describedby="transcription-model-dialog-subtitle"
                    ontoggle={handleModelPickerToggle}
                  >
                    <div class="model-picker-header">
                      <strong id="transcription-model-dialog-title">
                        Choose a model
                      </strong>
                      <span id="transcription-model-dialog-subtitle">
                        Small is the best starting point for most videos.
                      </span>
                    </div>
                    <div
                      class="model-picker-options"
                      role="listbox"
                      aria-labelledby="transcription-model-dialog-title"
                    >
                      {#each data.transcriptionModels as model (model.key)}
                        <button
                          class="model-option"
                          type="button"
                          role="option"
                          aria-selected={model.key === selectedModelKey}
                          data-fit={model.fit}
                          onclick={() => selectTranscriptionModel(model.key)}
                        >
                          <span class="model-option-heading">
                            <strong>{model.displayName}</strong>
                            <span class="model-option-fit">
                              <span
                                class="model-fit-dot"
                                data-fit={model.fit}
                                aria-hidden="true"
                              ></span>
                              <span>{model.fitLabel || "Not checked"}</span>
                            </span>
                          </span>
                          <span class="model-option-description">
                            {model.description ?? "Description unavailable."}
                          </span>
                          <span class="model-option-footer">
                            <span class="model-option-memory">
                              {formatRecommendedMemory(
                                model.recommendedRamBytes,
                              )}
                            </span>
                            <span
                              class="model-download-status"
                              data-download-state={model.downloaded === null
                                ? "unknown"
                                : model.downloaded
                                  ? "downloaded"
                                  : "required"}
                            >
                              {#if model.downloaded === true}
                                Downloaded
                              {:else if model.downloaded === false}
                                Needs download
                              {:else}
                                Download status unavailable
                              {/if}
                            </span>
                          </span>
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>
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
  <dialog
    class="shortcut-guide"
    bind:this={shortcutGuide}
    aria-labelledby="shortcut-guide-title"
  >
    <div class="shortcut-guide-shell">
      <div class="shortcut-guide-header">
        <div>
          <span>Power user map</span>
          <h2 id="shortcut-guide-title">Keyboard shortcuts</h2>
        </div>
        <form method="dialog">
          <button
            class="shortcut-guide-close"
            type="submit"
            aria-label="Close keyboard shortcuts">Close</button
          >
        </form>
      </div>
      <p class="shortcut-guide-intro">
        Edit and navigate the studio without leaving the keyboard.
      </p>
      <div class="shortcut-groups">
        {#each shortcutGroups as group (group.title)}
          <section class="shortcut-group">
            <h3>{group.title}</h3>
            {#each group.shortcuts as shortcut (shortcut.id)}
              <div class="shortcut-row">
                <span class="shortcut-keys">
                  {#each shortcut.keys as key, index (key)}
                    {#if index > 0}<span aria-hidden="true">+</span>{/if}
                    <kbd>{key}</kbd>
                  {/each}
                </span>
                <span class="shortcut-description">{shortcut.description}</span>
              </div>
            {/each}
          </section>
        {/each}
      </div>
      <p class="shortcut-guide-note">
        Shortcuts pause while typing. Space preserves focused button, link, and
        summary activation. Press <kbd>?</kbd> to reopen this guide.
      </p>
    </div>
  </dialog>
</div>
