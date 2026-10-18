import type { TimingPart } from "./math";

export type TimelineKey = Pick<
  KeyboardEvent,
  "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey"
>;

type HandleEdge = Exclude<TimingPart, "whole">;

export type TimelineKeyAction =
  | { kind: "nudge"; edge: TimingPart; deltaUs: number }
  | { kind: "block" }
  | { kind: "focus_handle"; edge: HandleEdge }
  | { kind: "return_to_body" }
  | { kind: "cancel_drag" }
  | { kind: "navigate"; key: string }
  | { kind: "none" };

const NUDGE_US = 1_000;
const LARGE_NUDGE_US = 100_000;
const BRACKET_EDGES = new Map<string, HandleEdge>([
  ["[", "start"],
  ["]", "end"],
]);

// Alt is the nudge modifier so plain arrows stay free for moving between
// cues. A locked Alt+Arrow is still claimed so it never navigates history.
export function timelineKeyAction(
  event: TimelineKey,
  part: TimingPart,
  editable: boolean,
  dragging: boolean,
): TimelineKeyAction {
  const { key, altKey, shiftKey, ctrlKey, metaKey } = event;
  if (key === "Escape" && dragging) return { kind: "cancel_drag" };

  if (altKey && !ctrlKey && !metaKey) {
    const direction = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    if (direction !== 0) {
      if (!editable) return { kind: "block" };
      const stepUs = shiftKey ? LARGE_NUDGE_US : NUDGE_US;
      return { kind: "nudge", edge: part, deltaUs: direction * stepUs };
    }
  }

  // Cmd+[ and Ctrl+[ belong to the browser. Alt alone or with Ctrl (AltGr)
  // is how some layouts type the bracket itself.
  const browserShortcut = metaKey || (ctrlKey && !altKey);
  const bracketEdge = BRACKET_EDGES.get(key);
  if (bracketEdge && !browserShortcut) {
    return editable
      ? { kind: "focus_handle", edge: bracketEdge }
      : { kind: "none" };
  }

  if (part !== "whole") {
    return key === "Escape" ? { kind: "return_to_body" } : { kind: "none" };
  }
  const modified = altKey || ctrlKey || metaKey || shiftKey;
  return modified ? { kind: "none" } : { kind: "navigate", key };
}
