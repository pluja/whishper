import { tick } from "svelte";

// Svelte moves a keyed row by re-inserting its nodes, which drops the focus of
// an element inside it. An element that had focus takes it back once the
// update settles. Safari and Firefox on macOS leave a clicked button
// unfocused, and it stays that way.
export async function keepFocusThrough(
  element: HTMLElement,
  update: () => void,
): Promise<boolean> {
  const hadFocus = document.activeElement === element;
  update();
  await tick();
  const focusLost =
    document.activeElement === null || document.activeElement === document.body;
  if (!hadFocus || !focusLost || !element.isConnected) return false;
  element.focus();
  return true;
}
