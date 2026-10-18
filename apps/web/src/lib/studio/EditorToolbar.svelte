<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { pluralize } from "$lib/shared/format";

  let { editor }: { editor: CueEditor } = $props();

  let saveState = $derived(editor.autosave.state);
</script>

<div class="editor-toolbar" aria-label="Subtitle editing tools">
  <div class="tool-group">
    <button
      type="button"
      onclick={() => editor.undo()}
      disabled={!editor.canUndo}
      title="Undo (Ctrl+Z)"
    >
      <Icon name="undo" size={15} />
      <span class="visually-hidden">Undo</span>
    </button>
    <button
      type="button"
      onclick={() => editor.redo()}
      disabled={!editor.canRedo}
      title="Redo (Ctrl+Y)"
    >
      <Icon name="redo" size={15} />
      <span class="visually-hidden">Redo</span>
    </button>
  </div>
  <div class="tool-group">
    <button
      type="button"
      onclick={() => editor.splitSelected()}
      disabled={editor.readOnly || !editor.hasSelection}
    >
      <Icon name="scissors" size={15} /> Split
    </button>
    <button
      type="button"
      onclick={() => editor.mergeSelected()}
      disabled={editor.readOnly ||
        !editor.hasSelection ||
        editor.selectedCueIndex >= editor.cues.length - 1}
    >
      <Icon name="merge" size={15} /> Merge
    </button>
    <button
      type="button"
      onclick={() => editor.insertAfterSelected()}
      disabled={editor.readOnly}
    >
      <Icon name="plus" size={15} /> Insert
    </button>
    <button
      type="button"
      onclick={() => editor.deleteSelected()}
      disabled={editor.readOnly || !editor.hasSelection}
      title="Delete selected cue"
    >
      <Icon name="trash" size={15} />
      <span class="visually-hidden">Delete selected cue</span>
    </button>
  </div>
  <div class="tool-group nudge-tools">
    <button
      type="button"
      onclick={() => editor.nudgeSelected(-100)}
      disabled={editor.readOnly || !editor.hasSelection}
    >
      −100 ms
    </button>
    <button
      type="button"
      onclick={() => editor.nudgeSelected(100)}
      disabled={editor.readOnly || !editor.hasSelection}
    >
      +100 ms
    </button>
  </div>
</div>
<div class="editor-statusbar">
  <span class:has-issues={editor.issueCount > 0}>
    {editor.issueCount > 0
      ? pluralize(editor.issueCount, "quality warning")
      : "No timing or readability warnings"}
  </span>
  <span>Ctrl/⌘ S to save · Ctrl/⌘ Z to undo</span>
</div>
{#if editor.autosave.message}
  <div
    class="editor-message"
    class:error={saveState === "error" || saveState === "conflict"}
  >
    <span>{editor.autosave.message}</span>
    {#if saveState === "error"}
      <button type="button" onclick={() => void editor.autosave.flush()}
        >Retry</button
      >
    {:else if saveState === "conflict"}
      <button type="button" onclick={() => location.reload()}>Reload</button>
    {/if}
  </div>
{/if}
