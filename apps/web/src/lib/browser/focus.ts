import { tick } from "svelte";

// Svelte moves a keyed row by re-inserting its nodes, which drops the focus of
// an element inside it. The element takes focus back once the update settles.
export async function keepFocusThrough(
  element: HTMLElement,
  update: () => void,
): Promise<boolean> {
  update();
  await tick();
  const focusLost =
    document.activeElement === null || document.activeElement === document.body;
  if (!focusLost || !element.isConnected) return false;
  element.focus();
  return true;
}
