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
  isGuideOpen(): boolean;
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
};

const TEXT_ENTRY_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const ACTIVATION_TARGET_SELECTOR =
  'button, a, summary, [role="button"], [role="link"]';

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
    title: "Timeline",
    shortcuts: [
      {
        id: "timeline-nudge",
        keys: ["← / →"],
        description: "Move a focused cue or handle by one millisecond",
      },
      {
        id: "timeline-large-nudge",
        keys: ["Shift", "← / →"],
        description: "Move a focused cue or handle by 100 milliseconds",
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
    matchesClosest(event.target, TEXT_ENTRY_TARGET_SELECTOR)
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
  if (commands.isGuideOpen() || event.defaultPrevented) return;

  const key = event.key.toLowerCase();
  if (
    event.repeat &&
    (event.key === " " || key === "j" || key === "k" || key === "l")
  ) {
    return;
  }

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
