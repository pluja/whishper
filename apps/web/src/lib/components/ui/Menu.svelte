<script lang="ts" module>
  export type TriggerArgs = {
    popovertarget: string;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
  };

  const GAP_PX = 4;
  // Evaluated per environment; only read from browser-side handlers and effects, so the server's false never reaches the DOM.
  const SUPPORTS_ANCHORING =
    typeof CSS !== "undefined" && CSS.supports("anchor-name", "--menu");
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { hideOnTab, returnFocusOnHide } from "$lib/browser/popover-focus";
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
    return [...panel.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
  }

  function focusItem(key: string) {
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = nextMenuIndex(
      current,
      key,
      items.map(() => true),
    );
    if (next === null) return false;
    items[next].focus();
    return true;
  }

  function anchoredPlacement(): string {
    const side =
      align === "end" ? "right: anchor(right)" : "left: anchor(left)";
    return `position-anchor: ${anchorName}; top: calc(anchor(bottom) + ${GAP_PX}px); ${side}; position-try-fallbacks: flip-block;`;
  }

  function fallbackPlacement(): string {
    const rect = anchor.getBoundingClientRect();
    const viewport = document.documentElement;
    const height = panel.offsetHeight;
    const flipAbove =
      rect.bottom + GAP_PX + height > viewport.clientHeight &&
      rect.top >= height + GAP_PX;
    const vertical = flipAbove
      ? `bottom: ${viewport.clientHeight - rect.top + GAP_PX}px`
      : `top: ${rect.bottom + GAP_PX}px`;
    const side =
      align === "end"
        ? `right: ${viewport.clientWidth - rect.right}px`
        : `left: ${rect.left}px`;
    return `${vertical}; ${side};`;
  }

  $effect(() => {
    if (!open || SUPPORTS_ANCHORING) return;
    const reposition = () => (placement = fallbackPlacement());
    window.addEventListener("scroll", reposition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  });

  function handleBeforeToggle(event: ToggleEvent) {
    open = event.newState === "open";
    if (open) {
      // The panel isn't rendered yet, so the fallback can't measure it to flip; handleToggle corrects it once shown.
      placement = SUPPORTS_ANCHORING
        ? anchoredPlacement()
        : fallbackPlacement();
      return;
    }
    returnFocusOnHide(
      panel,
      anchor.querySelector<HTMLElement>(`[popovertarget="${id}"]`),
    );
  }

  function handleToggle(event: ToggleEvent) {
    if (event.newState !== "open") return;
    if (!SUPPORTS_ANCHORING) placement = fallbackPlacement();
    focusItem("Home");
  }

  function handleKeydown(event: KeyboardEvent) {
    if (hideOnTab(event, panel)) return;
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
    class="inset-auto m-0 min-w-44 rounded-md border border-border bg-surface-raised p-1 text-text shadow-lg"
  >
    {@render children()}
  </div>
</div>
