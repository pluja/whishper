<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import Icon from "../Icon.svelte";
  import { groupIntoSections, nextPickerIndex, typeaheadIndex } from "./picker";
  import { CONTROL_CLASSES } from "./variants";

  type Props = {
    label: string;
    name: string;
    options: T[];
    key: (option: T) => string;
    optionText: (option: T) => string;
    value?: string;
    title: string;
    subtitle?: string;
    searchLabel?: string;
    matches?: (option: T, query: string) => boolean;
    // Consecutive options sharing a non-empty group get a heading.
    group?: (option: T) => string;
    divided?: boolean;
    selection: Snippet<[T | undefined]>;
    option: Snippet<[T]>;
    children?: Snippet;
  };

  let {
    label,
    name,
    options,
    key,
    optionText,
    value = $bindable(""),
    title,
    subtitle,
    searchLabel = "Search",
    matches,
    group,
    divided = false,
    selection,
    option,
    children,
  }: Props = $props();

  const TYPEAHEAD_RESET_MS = 500;
  const id = $props.id();
  let trigger: HTMLButtonElement;
  let panel: HTMLElement;
  let listbox: HTMLElement;
  let searchInput = $state<HTMLInputElement>();
  let open = $state(false);
  let query = $state("");
  let activeIndex = $state(-1);
  let typed = "";
  let typedAt = 0;

  const searchable = $derived(matches !== undefined);
  const selected = $derived(options.find((entry) => key(entry) === value));
  const visibleOptions = $derived(filterOptions(query));
  const sections = $derived(groupIntoSections(visibleOptions, group));
  const activeId = $derived(
    activeIndex >= 0 ? optionId(activeIndex) : undefined,
  );

  $effect(() => {
    if (open && activeId) scrollIntoView(activeId);
  });

  function filterOptions(text: string): T[] {
    if (!matches || !text.trim()) return options;
    return options.filter((entry) => matches(entry, text));
  }

  function optionId(index: number): string {
    return `${id}-option-${index}`;
  }

  function scrollIntoView(elementId: string): void {
    document.getElementById(elementId)?.scrollIntoView({ block: "nearest" });
  }

  function resetActiveOption(): void {
    const selectedIndex = visibleOptions.findIndex(
      (entry) => key(entry) === value,
    );
    activeIndex =
      selectedIndex >= 0 ? selectedIndex : visibleOptions.length ? 0 : -1;
  }

  function selectOption(index: number): void {
    const picked = visibleOptions[index];
    if (picked === undefined) return;
    value = key(picked);
    panel.hidePopover();
  }

  function isTypingAhead(now: number): boolean {
    return typed !== "" && now - typedAt <= TYPEAHEAD_RESET_MS;
  }

  function typeAhead(character: string): void {
    const now = Date.now();
    typed = isTypingAhead(now) ? typed + character : character;
    typedAt = now;
    const index = typeaheadIndex(
      visibleOptions.map(optionText),
      activeIndex,
      typed,
    );
    if (index !== null) activeIndex = index;
  }

  // Opening through the trigger's own click keeps it the popover's invoker and anchor.
  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    trigger.click();
  }

  function handleBeforeToggle(event: ToggleEvent): void {
    open = event.newState === "open";
    if (open) {
      query = "";
      typed = "";
      resetActiveOption();
      return;
    }
    const focused = document.activeElement;
    if (!focused || focused === document.body || panel.contains(focused)) {
      trigger.focus();
    }
  }

  function handleToggle(event: ToggleEvent): void {
    if (event.newState !== "open") return;
    (searchInput ?? listbox).focus();
    if (activeId) scrollIntoView(activeId);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      panel.hidePopover();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      panel.hidePopover();
      return;
    }
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const selectsWithSpace =
      event.key === " " && !searchable && !isTypingAhead(Date.now());
    if (event.key === "Enter" || selectsWithSpace) {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    }
    const next = nextPickerIndex(activeIndex, event.key, visibleOptions.length);
    if (next !== null) {
      event.preventDefault();
      activeIndex = next;
      return;
    }
    if (!searchable && event.key.length === 1) {
      event.preventDefault();
      typeAhead(event.key);
    }
  }
</script>

{#snippet rows(entries: { option: T; index: number }[])}
  {#each entries as entry (key(entry.option))}
    <!-- svelte-ignore a11y_click_events_have_key_events (keys reach options through the popover and aria-activedescendant) -->
    <div
      id={optionId(entry.index)}
      role="option"
      tabindex="-1"
      aria-selected={key(entry.option) === value}
      data-active={entry.index === activeIndex || undefined}
      class={[
        "cursor-default px-3 py-2 text-left break-words hover:not-aria-selected:bg-surface-sunken aria-selected:bg-accent-soft aria-selected:shadow-[inset_3px_0_var(--color-accent)] data-active:outline-2 data-active:-outline-offset-2 data-active:outline-focus data-active:not-aria-selected:bg-surface-sunken",
        divided && "border-t border-border first:border-t-0",
      ]}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => selectOption(entry.index)}
    >
      {@render option(entry.option)}
    </div>
  {/each}
{/snippet}

<div class="grid min-w-0 gap-1.5">
  <span id="{id}-label" class="text-sm font-medium text-text">{label}</span>
  <input type="hidden" {name} {value} />
  <button
    bind:this={trigger}
    class="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-expanded:border-accent motion-reduce:transition-none"
    type="button"
    popovertarget="{id}-popover"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls="{id}-popover"
    aria-labelledby="{id}-label {id}-selection"
    onkeydown={handleTriggerKeydown}
  >
    <span id="{id}-selection" class="min-w-0 flex-1">
      {@render selection(selected)}
    </span>
    <span
      class={[
        "shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-180",
      ]}
    >
      <Icon name="chevron-down" size={18} />
    </span>
  </button>
  {@render children?.()}
  <div
    bind:this={panel}
    id="{id}-popover"
    popover
    role="dialog"
    tabindex="-1"
    aria-labelledby="{id}-title"
    aria-describedby={subtitle ? `${id}-subtitle` : undefined}
    onbeforetoggle={handleBeforeToggle}
    ontoggle={handleToggle}
    onkeydown={handleKeydown}
    class="inset-auto m-0 mb-1 max-h-[min(36rem,calc(100%-0.5rem))] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-surface-raised p-0 text-text shadow-lg transition-[opacity,scale] duration-150 [position-area:block-start_span-inline-end] [position-try-fallbacks:flip-block,flip-inline] [position-try-order:most-height] open:flex not-supports-[position-area:block-start]:top-1/2 not-supports-[position-area:block-start]:left-1/2 not-supports-[position-area:block-start]:max-h-[min(36rem,calc(100dvh-1.5rem))] not-supports-[position-area:block-start]:-translate-1/2 motion-reduce:transition-none starting:open:scale-98 starting:open:opacity-0"
  >
    <div class="grid gap-0.5 border-b border-border px-3 py-2.5">
      <strong id="{id}-title" class="text-sm font-semibold">{title}</strong>
      {#if subtitle}
        <span id="{id}-subtitle" class="text-xs text-text-muted">
          {subtitle}
        </span>
      {/if}
    </div>
    {#if searchable}
      <div class="relative border-b border-border p-2">
        <span
          class="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 text-text-muted"
        >
          <Icon name="search" size={16} />
        </span>
        <input
          bind:this={searchInput}
          bind:value={query}
          class="{CONTROL_CLASSES} h-9 pl-8"
          type="text"
          role="combobox"
          aria-label={searchLabel}
          aria-expanded="true"
          aria-controls="{id}-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autocomplete="off"
          spellcheck="false"
          oninput={resetActiveOption}
        />
      </div>
    {/if}
    <div
      bind:this={listbox}
      id="{id}-listbox"
      class="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
      role="listbox"
      tabindex={searchable ? -1 : 0}
      aria-labelledby="{id}-title"
      aria-activedescendant={searchable ? undefined : activeId}
    >
      {#each sections as section, sectionIndex}
        {#if section.label}
          <div role="group" aria-labelledby="{id}-group-{sectionIndex}">
            <div
              id="{id}-group-{sectionIndex}"
              class="px-3 pt-3 pb-1 text-xs font-medium text-text-muted"
              role="presentation"
            >
              {section.label}
            </div>
            {@render rows(section.entries)}
          </div>
        {:else}
          {@render rows(section.entries)}
        {/if}
      {:else}
        <div
          class="px-3 py-2 text-sm text-text-muted"
          role="option"
          aria-selected="false"
          aria-disabled="true"
        >
          No matches
        </div>
      {/each}
    </div>
  </div>
</div>
