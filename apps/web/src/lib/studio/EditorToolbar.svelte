<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import { ToolbarFocus } from "$lib/components/ui/toolbar-focus.svelte";
  import type { IconName } from "$lib/components/icon-names";
  import { charactersPerSecond } from "$lib/editor/cues";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { pluralize } from "$lib/shared/format";
  import { CUE_TIME_ERROR_ID } from "./cue-status";

  type ToolbarAction = {
    label: string;
    icon?: IconName;
    keyshortcuts?: string;
    shortcut?: string;
    disabled: boolean;
    run: () => void;
  };

  let { editor }: { editor: CueEditor } = $props();

  const saveState = $derived(editor.autosave.state);
  const editDisabled = $derived(editor.readOnly || !editor.hasSelection);
  const selectedCue = $derived(editor.cues[editor.selectedCueIndex]);

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

  const toolbarFocus = new ToolbarFocus(() =>
    actions.map((action) => action.disabled),
  );
</script>

<div
  bind:this={toolbarFocus.element}
  class="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
  role="toolbar"
  aria-label="Cue editing"
  tabindex="-1"
  onkeydown={toolbarFocus.handleKeydown}
  onfocusin={toolbarFocus.handleFocusIn}
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
            tabindex={toolbarFocus.tabIndex(index)}
            disabled={action.disabled}
            onclick={action.run}
          />
        {:else}
          <Button
            variant="ghost"
            size="sm"
            class="font-mono tabular-nums"
            tabindex={toolbarFocus.tabIndex(index)}
            disabled={action.disabled}
            onclick={action.run}>{action.label}</Button
          >
        {/if}
      {/each}
    </div>
  {/each}
</div>
<!-- One line at every width, so selection and errors never move the cue rows. -->
<div
  class="@container flex shrink-0 items-center gap-3 border-b border-border px-4 py-1 text-xs whitespace-nowrap text-text-muted"
>
  {#if editor.refusal}
    <span id={CUE_TIME_ERROR_ID} class="min-w-0 truncate text-danger">
      {editor.refusal.message}
    </span>
  {:else}
    <span class={["min-w-0 truncate", editor.issueCount > 0 && "text-warning"]}>
      {editor.issueCount > 0
        ? pluralize(editor.issueCount, "quality warning")
        : "No timing or readability warnings"}
    </span>
    {#if selectedCue}
      {@const cps = charactersPerSecond(selectedCue)}
      <span class="ml-auto shrink-0 tabular-nums">
        <span class="hidden @min-[24rem]:inline"
          >Cue {editor.selectedCueIndex + 1} ·
        </span>
        <span
          class={selectedCue.text.length > editor.maxLineLength
            ? "text-warning"
            : undefined}
          >{selectedCue.text.length}/{editor.maxLineLength} chars</span
        >{#if cps !== null}{` · ${cps.toFixed(1)} CPS`}{/if}
      </span>
    {/if}
    {#if !editor.readOnly}
      <span class="hidden min-w-0 shrink-[999] truncate @min-[34rem]:block"
        >Ctrl/⌘ S to save · Ctrl/⌘ Z to undo</span
      >
    {/if}
  {/if}
</div>
<!-- The save status itself changes with every edit, so only these messages are
     announced. The live region stays mounted so a new message is read out. -->
<div role="status" class="shrink-0">
  {#if editor.autosave.message}
    {@const failed = saveState === "error" || saveState === "conflict"}
    <div
      class={[
        "flex items-center justify-between gap-3 border-b border-border px-4 py-1 text-sm",
        failed ? "bg-danger-soft text-danger" : "bg-accent-soft text-text",
      ]}
    >
      <span class="min-w-0 py-1">{editor.autosave.message}</span>
      {#if saveState === "error" && !editor.readOnly}
        <Button size="sm" onclick={() => void editor.autosave.flush()}
          >Retry</Button
        >
      {:else if saveState === "conflict"}
        <Button size="sm" onclick={() => location.reload()}>Reload</Button>
      {/if}
    </div>
  {/if}
</div>
