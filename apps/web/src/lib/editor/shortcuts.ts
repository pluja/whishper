import type { CueTimeField } from "./cues";

type ShortcutDefinition = {
  id: string;
  keys: readonly string[];
  description: string;
};

export type ShortcutGroup = {
  title: string;
  shortcuts: readonly ShortcutDefinition[];
};

type StudioTransportCommands = {
  togglePlayback(): boolean;
  startReverseShuttle(): boolean;
  playForwardAtNormalRate(): boolean;
  startForwardShuttle(): boolean;
  stepFrames(direction: -1 | 1, frameCount: number): boolean;
  jumpToCueStart(direction: -1 | 1): boolean;
  goToSourceEdge(end: boolean): boolean;
};

export type StudioCommands = {
  transport: StudioTransportCommands;
  isDialogOpen(): boolean;
  openGuide(): void;
  canSave(): boolean;
  save(): void;
  canUndo(): boolean;
  undo(): void;
  canRedo(): boolean;
  redo(): void;
  hasSelection(): boolean;
  splitSelected(): void;
  deleteSelected(): void;
  setSelectedTimeToPlayhead(field: CueTimeField): void;
};

const TEXT_ENTRY_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
// Fields that rewrite their own value keep no native undo history, so undo
// and redo there act on the cues.
const NO_NATIVE_UNDO_SELECTOR = "[data-no-native-undo]";
const ACTIVATION_TARGET_SELECTOR =
  'button, a, summary, [role="button"], [role="link"]';
// Focus can only be inside a popover, such as a menu or picker, while it is open.
const OPEN_POPOVER_SELECTOR = "[popover]";
// Keys that toggle, mark or delete act once per press, never on key repeat.
const SINGLE_PRESS_KEYS = new Set([
  " ",
  "j",
  "k",
  "l",
  "i",
  "o",
  "delete",
  "backspace",
]);

export const shortcutGroups: readonly ShortcutGroup[] = [
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
        id: "set-start",
        keys: ["I"],
        description: "Set the selected cue's start to the playhead",
      },
      {
        id: "set-end",
        keys: ["O"],
        description: "Set the selected cue's end to the playhead",
      },
      {
        id: "delete",
        keys: ["Shift", "Delete / Backspace"],
        description: "Deliberately delete the selected cue",
      },
      {
        id: "undo",
        keys: ["Ctrl/Command", "Z"],
        description: "Undo the last cue edit; text fields keep their own undo",
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
  {
    title: "Timing fields",
    shortcuts: [
      {
        id: "timecode-type",
        keys: ["0-9"],
        description: "Overwrite the digit under the caret",
      },
      {
        id: "timecode-erase",
        keys: ["Backspace / Delete"],
        description: "Set the digit before or after the caret to zero",
      },
      {
        id: "timecode-paste",
        keys: ["Ctrl/Command", "V"],
        description: "Paste a time such as 27, 1:02.5 or 00:01:02,500",
      },
      {
        id: "timecode-step",
        keys: ["↑ / ↓"],
        description: "Step the hours, minutes, seconds or milliseconds",
      },
      {
        id: "timecode-large-step",
        keys: ["Shift", "↑ / ↓"],
        description: "Step the same part by ten",
      },
      {
        id: "timecode-apply",
        keys: ["Enter"],
        description: "Apply the typed time",
      },
      {
        id: "timecode-revert",
        keys: ["Escape"],
        description: "Return to the last applied time",
      },
    ],
  },
  {
    title: "Timeline",
    shortcuts: [
      {
        id: "timeline-move",
        keys: ["← / →"],
        description: "Select the previous or next cue from a focused cue",
      },
      {
        id: "timeline-ends",
        keys: ["Home / End"],
        description: "Select the first or last cue from a focused cue",
      },
      {
        id: "timeline-nudge",
        keys: ["Alt", "← / →"],
        description: "Move a focused cue or handle by one millisecond",
      },
      {
        id: "timeline-large-nudge",
        keys: ["Alt", "Shift", "← / →"],
        description: "Move a focused cue or handle by 100 milliseconds",
      },
      {
        id: "timeline-handles",
        keys: ["[ / ]"],
        description:
          "Focus the start or end handle of a focused cue; Escape returns to the cue",
      },
      {
        id: "timeline-pass-neighbours",
        keys: ["Alt", "Drag"],
        description: "Drag a cue or handle past its neighbouring cues",
      },
    ],
  },
];

function matchesClosest(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

function handleCommandShortcut(
  event: KeyboardEvent,
  key: string,
  commands: StudioCommands,
): void {
  if (!event.shiftKey && key === "s" && commands.canSave()) {
    event.preventDefault();
    commands.save();
    return;
  }
  if (
    (key === "z" || key === "y") &&
    matchesClosest(event.target, TEXT_ENTRY_TARGET_SELECTOR) &&
    !matchesClosest(event.target, NO_NATIVE_UNDO_SELECTOR)
  ) {
    return;
  }
  if (!event.shiftKey && key === "z" && commands.canUndo()) {
    event.preventDefault();
    commands.undo();
    return;
  }
  if (
    ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y")) &&
    commands.canRedo()
  ) {
    event.preventDefault();
    commands.redo();
    return;
  }
  if (!event.shiftKey && key === "k" && commands.hasSelection()) {
    event.preventDefault();
    commands.splitSelected();
  }
}

function handlePlainShortcut(
  event: KeyboardEvent,
  key: string,
  commands: StudioCommands,
): boolean {
  const { transport } = commands;
  if (!event.shiftKey && event.key === " ") return transport.togglePlayback();
  if (!event.shiftKey && key === "j") return transport.startReverseShuttle();
  if (!event.shiftKey && key === "k")
    return transport.playForwardAtNormalRate();
  if (!event.shiftKey && key === "l") return transport.startForwardShuttle();
  if (event.key === "ArrowLeft")
    return transport.stepFrames(-1, event.shiftKey ? 5 : 1);
  if (event.key === "ArrowRight")
    return transport.stepFrames(1, event.shiftKey ? 5 : 1);
  if (!event.shiftKey && event.key === "ArrowUp")
    return transport.jumpToCueStart(-1);
  if (!event.shiftKey && event.key === "ArrowDown")
    return transport.jumpToCueStart(1);
  if (!event.shiftKey && event.key === "Home")
    return transport.goToSourceEdge(false);
  if (!event.shiftKey && event.key === "End")
    return transport.goToSourceEdge(true);
  if (
    !event.shiftKey &&
    (key === "i" || key === "o") &&
    commands.hasSelection()
  ) {
    commands.setSelectedTimeToPlayhead(key === "i" ? "start_us" : "end_us");
    return true;
  }
  if (
    event.shiftKey &&
    (event.key === "Delete" || event.key === "Backspace") &&
    commands.hasSelection()
  ) {
    commands.deleteSelected();
    return true;
  }
  if (event.key === "?") {
    commands.openGuide();
    return true;
  }
  return false;
}

export function handleStudioKeydown(
  event: KeyboardEvent,
  commands: StudioCommands,
): void {
  if (
    commands.isDialogOpen() ||
    event.defaultPrevented ||
    matchesClosest(event.target, OPEN_POPOVER_SELECTOR)
  ) {
    return;
  }

  const key = event.key.toLowerCase();
  if (event.repeat && SINGLE_PRESS_KEYS.has(key)) return;

  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    handleCommandShortcut(event, key, commands);
    return;
  }

  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    matchesClosest(event.target, TEXT_ENTRY_TARGET_SELECTOR)
  ) {
    return;
  }
  if (
    event.key === " " &&
    matchesClosest(event.target, ACTIVATION_TARGET_SELECTOR)
  ) {
    return;
  }

  if (handlePlainShortcut(event, key, commands)) event.preventDefault();
}
