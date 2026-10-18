<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import Icon from "$lib/components/Icon.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import TimecodeInput from "$lib/components/ui/TimecodeInput.svelte";
  import {
    charactersPerSecond,
    cueTimeError,
    type CueTimeField,
    type EditorCue,
  } from "$lib/editor/cues";
  import type { CueEditor } from "$lib/editor/editor.svelte";

  let { editor }: { editor: CueEditor } = $props();

  const uid = $props.id();
  const FOCUS_RING =
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";

  const activeCueId = $derived(editor.transport.activeCue?.id);

  const rows = new Map<string, HTMLElement>();

  function registerRow(cueId: string): Attachment<HTMLElement> {
    return (element) => {
      rows.set(cueId, element);
      return () => rows.delete(cueId);
    };
  }

  // The selection follows the playhead one timeupdate late, so the list
  // reveals it when it changes, when the playhead enters another cue, and
  // after a seek, which can land in the cue already selected. A cue being
  // edited is never scrolled away from.
  $effect(() => {
    const cueId = editor.selectedCueId;
    void activeCueId;
    void editor.transport.seekRevision;
    untrack(() => {
      if (cueId && !editor.editing) {
        rows.get(cueId)?.scrollIntoView({ block: "nearest" });
      }
    });
  });

  const TIME_FIELDS = {
    start_us: { edge: "start", shortcut: "I" },
    end_us: { edge: "end", shortcut: "O" },
  } as const;
  const timecodeHintId = `${uid}-timecode-hint`;

  function timeErrorFor(cueId: string, field: CueTimeField): string | null {
    const error = editor.timeError;
    return error?.cueId === cueId && error.field === field
      ? error.message
      : null;
  }

  function reportTimeError(
    cueId: string,
    field: CueTimeField,
    message: string | null,
  ): void {
    if (message) editor.showTimeError(cueId, field, message);
    else editor.clearTimeError(cueId, field);
  }

  function fieldClasses(selected: boolean, invalid = false): string {
    const border = invalid
      ? "border-danger"
      : `hover:border-border-strong focus:border-accent ${selected ? "border-border-strong" : "border-transparent"}`;
    return `rounded border text-text focus:bg-surface ${FOCUS_RING} ${border} ${selected ? "bg-surface" : "bg-transparent"}`;
  }

  function rememberCursor(cueId: string, event: Event): void {
    editor.rememberCursor(
      cueId,
      (event.currentTarget as HTMLTextAreaElement).selectionStart,
    );
  }
</script>

{#snippet timeField(
  cue: EditorCue,
  index: number,
  field: CueTimeField,
  selected: boolean,
  errorId: string,
)}
  {@const { edge, shortcut } = TIME_FIELDS[field]}
  {@const error = timeErrorFor(cue.id, field)}
  <span class="inline-flex items-center">
    <TimecodeInput
      class="h-6 w-[14ch] px-1 {fieldClasses(selected, Boolean(error))}"
      label={`Cue ${index + 1} ${edge} time`}
      value={cue[field]}
      validate={(microseconds) => cueTimeError(cue, field, microseconds)}
      onchange={(microseconds) => editor.setTime(index, field, microseconds)}
      onerror={(message) => reportTimeError(cue.id, field, message)}
      invalid={Boolean(error)}
      describedBy={error ? `${timecodeHintId} ${errorId}` : timecodeHintId}
      readonly={editor.readOnly}
      onfocus={() => editor.beginEdit()}
      onblur={() => editor.finishEdit()}
    />
    {#if selected}
      <IconButton
        size="xs"
        icon="playhead"
        label={`Set ${edge} to playhead`}
        {shortcut}
        disabled={editor.readOnly}
        onclick={() => editor.setTimeToPlayhead(index, field)}
      />
    {/if}
  </span>
{/snippet}

{#if editor.cues.length === 0}
  <div class="grid content-start justify-items-start gap-2 px-5 py-6">
    <h3 class="text-sm font-semibold text-text">This track has no cues</h3>
    <p class="text-sm text-text-muted">Insert a cue to continue editing.</p>
    <Button
      size="sm"
      disabled={editor.readOnly}
      onclick={() => editor.insertAfterSelected()}>Insert first cue</Button
    >
  </div>
{:else}
  <p id={timecodeHintId} class="sr-only">
    Type digits to overwrite the time. Up and Down arrows step the part under
    the caret, ten times as far with Shift. Enter applies, Escape reverts.
  </p>
  <p class="sr-only" aria-live="polite">{editor.timeError?.message ?? ""}</p>
  <ol
    class="min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
    aria-label="Cues"
  >
    {#each editor.cues as cue, index (cue.id)}
      {@const issues = editor.issues[index]}
      {@const selected = editor.selectedCueId === cue.id}
      {@const active = activeCueId === cue.id}
      {@const issuesId = `${uid}-issues-${cue.id}`}
      {@const timeErrorId = `${uid}-time-error-${cue.id}`}
      {@const rowTimeError =
        editor.timeError?.cueId === cue.id ? editor.timeError.message : null}
      <li
        {@attach registerRow(cue.id)}
        class={[
          "grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 border-b border-l-2 border-b-border py-1.5 pr-3 pl-2",
          selected
            ? "border-l-accent bg-accent-soft"
            : active
              ? "border-l-accent/40"
              : "border-l-transparent hover:bg-surface-sunken",
        ]}
        onfocusin={() => (editor.selectedCueId = cue.id)}
      >
        <button
          class={[
            "h-6 w-8 rounded text-left font-mono text-xs tabular-nums hover:bg-surface-sunken hover:text-text",
            FOCUS_RING,
            active ? "font-semibold text-accent" : "text-text-subtle",
          ]}
          type="button"
          onclick={() => {
            editor.selectedCueId = cue.id;
            editor.transport.seekTo(cue.start_us);
          }}
          aria-label={`Play cue ${index + 1}`}
        >
          {index + 1}
        </button>
        <div class="grid min-w-0 gap-1">
          <div
            class="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-xs tabular-nums"
          >
            {@render timeField(cue, index, "start_us", selected, timeErrorId)}
            <span class="text-text-subtle" aria-hidden="true">→</span>
            {@render timeField(cue, index, "end_us", selected, timeErrorId)}
            <span class="ml-auto flex gap-2 pl-1 text-text-subtle">
              {#if selected}
                {@const cps = charactersPerSecond(cue)}
                <span
                  class={cue.text.length > editor.maxLineLength
                    ? "text-warning"
                    : undefined}
                >
                  {cue.text.length}/{editor.maxLineLength} chars
                </span>
                {#if cps !== null}
                  <span>{cps.toFixed(1)} CPS</span>
                {/if}
              {/if}
              <span
                >{((cue.end_us - cue.start_us) / 1_000_000).toFixed(2)}s</span
              >
            </span>
          </div>
          {#if rowTimeError}
            <p id={timeErrorId} class="text-xs text-danger">{rowTimeError}</p>
          {/if}
          <textarea
            class="w-full resize-none px-1 py-1 text-sm leading-snug field-sizing-content {fieldClasses(
              selected,
            )}"
            aria-label={`Cue ${index + 1} text`}
            aria-describedby={issues.length ? issuesId : undefined}
            rows="2"
            value={cue.text}
            onfocus={() => editor.beginEdit()}
            oninput={(event) =>
              editor.setText(index, event.currentTarget.value)}
            onselect={(event) => rememberCursor(cue.id, event)}
            onclick={(event) => rememberCursor(cue.id, event)}
            onkeyup={(event) => rememberCursor(cue.id, event)}
            onblur={() => editor.finishEdit()}
            readonly={editor.readOnly}
            spellcheck="true"
          ></textarea>
          {#if issues.length}
            <ul
              id={issuesId}
              class="flex flex-wrap gap-1"
              aria-label={`Cue ${index + 1} issues: ${issues.join(", ")}`}
            >
              {#each issues as issue (issue)}
                <li>
                  <Badge tone="warning">
                    <Icon name="alert" size={12} />
                    {issue}
                  </Badge>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/if}
