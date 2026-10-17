<script lang="ts" module>
  export type TriggerArgs = {
    popovertarget: string;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { nextMenuIndex } from "./menu-keyboard";

  type Props = {
    label: string;
    trigger: Snippet<[TriggerArgs]>;
    children: Snippet;
    align?: "start" | "end";
  };

  let { label, trigger, children, align = "start" }: Props = $props();

  const id = $props.id();
  const anchorName = `--menu-${id}`;
  let open = $state(false);
  let placement = $state("");
  let anchor: HTMLElement;
  let panel: HTMLElement;

  function menuItems(): HTMLElement[] {
    return [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function focusItem(key: string) {
    const items = menuItems();
    const enabled = items.map(
      (item) => item.getAttribute("aria-disabled") !== "true",
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = nextMenuIndex(current, key, enabled);
    if (next === null) return false;
    items[next].focus();
    return true;
  }

  function computePlacement(): string {
    if (CSS.supports("anchor-name", anchorName)) {
      const side =
        align === "end" ? "right: anchor(right)" : "left: anchor(left)";
      return `position-anchor: ${anchorName}; top: anchor(bottom); ${side}; position-try-fallbacks: flip-block;`;
    }
    const rect = anchor.getBoundingClientRect();
    const side =
      align === "end"
        ? `right: ${window.innerWidth - rect.right}px`
        : `left: ${rect.left}px`;
    return `top: ${rect.bottom}px; ${side};`;
  }

  function handleBeforeToggle(event: ToggleEvent) {
    open = event.newState === "open";
    if (open) {
      placement = computePlacement();
      return;
    }
    // Synchronous so that a dialog opened from an item's onselect captures the trigger as its return target.
    const focused = document.activeElement;
    if (!focused || focused === document.body || panel.contains(focused)) {
      anchor.querySelector<HTMLElement>(`[popovertarget="${id}"]`)?.focus();
    }
  }

  function handleToggle(event: ToggleEvent) {
    if (event.newState === "open") focusItem("Home");
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      panel.hidePopover();
      return;
    }
    if (focusItem(event.key)) event.preventDefault();
  }
</script>

<div bind:this={anchor} class="inline-flex" style:anchor-name={anchorName}>
  {@render trigger({
    popovertarget: id,
    "aria-haspopup": "menu",
    "aria-expanded": open,
  })}
  <div
    bind:this={panel}
    {id}
    popover="auto"
    role="menu"
    aria-label={label}
    tabindex="-1"
    style={placement}
    onbeforetoggle={handleBeforeToggle}
    ontoggle={handleToggle}
    onkeydown={handleKeydown}
    class="inset-auto m-0 mt-1 min-w-44 rounded-md border border-border bg-surface-raised p-1 text-text shadow-lg"
  >
    {@render children()}
  </div>
</div>
