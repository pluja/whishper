// Escape, light dismiss and Tab leave focus on the body or inside the hidden
// panel. Returning it while the popover hides, not after, lets a dialog opened
// from inside the popover capture the trigger as its return target.
export function returnFocusOnHide(
  panel: HTMLElement,
  trigger: HTMLElement | null | undefined,
): void {
  const focused = document.activeElement;
  if (!focused || focused === document.body || panel.contains(focused)) {
    trigger?.focus();
  }
}

// Hiding moves focus back to the trigger, so the browser's own Tab step then
// continues from there.
export function hideOnTab(event: KeyboardEvent, panel: HTMLElement): boolean {
  if (event.key !== "Tab") return false;
  panel.hidePopover();
  return true;
}
