<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import { nextMenuIndex } from "$lib/components/ui/menu-keyboard";
  import type { IconName } from "$lib/components/icon-names";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { pluralize } from "$lib/shared/format";

  type ToolbarAction = {
    label: string;
    icon?: IconName;
    keyshortcuts?: string;
    shortcut?: string;
    disabled: boolean;
    run: () => void;
  };

  const FOCUS_KEYS: Record<string, string> = {
    ArrowLeft: "ArrowUp",
    ArrowRight: "ArrowDown",
    Home: "Home",
    End: "End",
  };

  let { editor }: { editor: CueEditor } = $props();

  const saveState = $derived(editor.autosave.state);
  const editDisabled = $derived(editor.readOnly || !editor.hasSelection);

  const actionGroups: ToolbarAction[][] = $derived([
    [
      {
        label: "Undo",
        icon: "undo",
        keyshortcuts: "Control+Z Meta+Z",
        shortcut: "Ctrl/⌘+Z",
        disabled: !editor.canUndo,
        run: () => editor.undo(),
      },
      {
        label: "Redo",
        icon: "redo",
        keyshortcuts: "Control+Y Control+Shift+Z Meta+Shift+Z",
        shortcut: "Ctrl/⌘+Shift+Z",
        disabled: !editor.canRedo,
        run: () => editor.redo(),
      },
    ],
    [
      {
        label: "Split cue",
        icon: "scissors",
        keyshortcuts: "Control+K Meta+K",
        shortcut: "Ctrl/⌘+K",
        disabled: editDisabled,
        run: () => editor.splitSelected(),
      },
      {
        label: "Merge with next cue",
        icon: "merge",
        disabled:
          editDisabled || editor.selectedCueIndex >= editor.cues.length - 1,
        run: () => editor.mergeSelected(),
      },
      {
        label: "Insert cue",
        icon: "plus",
        disabled: editor.readOnly,
        run: () => editor.insertAfterSelected(),
      },
      {
        label: "Delete selected cue",
        icon: "trash",
        keyshortcuts: "Shift+Delete Shift+Backspace",
        shortcut: "Shift+Delete",
        disabled: editDisabled,
        run: () => editor.deleteSelected(),
      },
    ],
    [
      {
        label: "−100 ms",
        disabled: editDisabled,
        run: () => editor.nudgeSelected(-100),
      },
      {
        label: "+100 ms",
        disabled: editDisabled,
        run: () => editor.nudgeSelected(100),
      },
    ],
  ]);
  const actions = $derived(actionGroups.flat());

  let toolbar: HTMLElement;
  let focusedIndex = $state(0);
  // One tab stop for the whole toolbar, moved to an enabled button when the
  // last focused one becomes disabled.
  const tabStopIndex = $derived(
    actions[focusedIndex]?.disabled === false
      ? focusedIndex
      : actions.findIndex((action) => !action.disabled),
  );

  function toolbarButtons(): HTMLButtonElement[] {
    return [...toolbar.querySelectorAll("button")];
  }

  function moveFocus(event: KeyboardEvent): void {
    const key = FOCUS_KEYS[event.key];
    if (!key || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = toolbarButtons();
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next = nextMenuIndex(
      current,
      key,
      buttons.map((button) => !button.disabled),
    );
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
  }

  function rememberFocus(event: FocusEvent): void {
    const index = toolbarButtons().indexOf(event.target as HTMLButtonElement);
    if (index >= 0) focusedIndex = index;
  }
</script>

<div
  bind:this={toolbar}
  class="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
  role="toolbar"
  aria-label="Cue editing"
  tabindex="-1"
  onkeydown={moveFocus}
  onfocusin={rememberFocus}
>
  {#each actionGroups as group, groupIndex (groupIndex)}
    {#if groupIndex > 0}
      <span class="mx-0.5 h-5 w-px bg-border" aria-hidden="true"></span>
    {/if}
    <div class="flex shrink-0 items-center gap-0.5">
      {#each group as action (action.label)}
        {@const index = actions.indexOf(action)}
        {#if action.icon}
          <IconButton
            label={action.label}
            icon={action.icon}
            shortcut={action.shortcut}
            size="sm"
            aria-keyshortcuts={action.keyshortcuts}
            tabindex={index === tabStopIndex ? 0 : -1}
            disabled={action.disabled}
            onclick={action.run}
          />
        {:else}
          <Button
            variant="ghost"
            size="sm"
            class="font-mono tabular-nums"
            tabindex={index === tabStopIndex ? 0 : -1}
            disabled={action.disabled}
            onclick={action.run}>{action.label}</Button
          >
        {/if}
      {/each}
    </div>
  {/each}
</div>
<div
  class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1 text-xs text-text-muted"
>
  <span class={editor.issueCount > 0 ? "text-warning" : undefined}>
    {editor.issueCount > 0
      ? pluralize(editor.issueCount, "quality warning")
      : "No timing or readability warnings"}
  </span>
  <span class="hidden sm:inline">Ctrl/⌘ S to save · Ctrl/⌘ Z to undo</span>
</div>
{#if editor.autosave.message}
  {@const failed = saveState === "error" || saveState === "conflict"}
  <div
    class={[
      "flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1 text-sm",
      failed ? "bg-danger-soft text-danger" : "bg-accent-soft text-text",
    ]}
  >
    <span class="min-w-0 py-1">{editor.autosave.message}</span>
    {#if saveState === "error"}
      <Button size="sm" onclick={() => void editor.autosave.flush()}
        >Retry</Button
      >
    {:else if saveState === "conflict"}
      <Button size="sm" onclick={() => location.reload()}>Reload</Button>
    {/if}
  </div>
{/if}
