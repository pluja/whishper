<script lang="ts">
  import { charactersPerSecond, cueTimeError } from "$lib/editor/cues";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { formatEditorTime, parseEditorTime } from "$lib/shared/subtitles";

  type Props = {
    editor: CueEditor;
    activeCueId: string | undefined;
    onseek: (microseconds: number) => void;
  };

  let { editor, activeCueId, onseek }: Props = $props();

  function updateTime(
    index: number,
    field: "start_us" | "end_us",
    event: Event,
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = parseEditorTime(input.value);
    if (parsed === null) {
      input.setCustomValidity("Use HH:MM:SS.mmm or MM:SS.mmm.");
      input.reportValidity();
      return;
    }
    const timeError = cueTimeError(editor.cues[index], field, parsed);
    input.setCustomValidity(timeError ?? "");
    if (timeError) {
      input.reportValidity();
      return;
    }
    editor.setTime(index, field, parsed);
  }

  function rememberCursor(cueId: string, event: Event): void {
    editor.rememberCursor(
      cueId,
      (event.currentTarget as HTMLTextAreaElement).selectionStart,
    );
  }
</script>

<div class="cue-list">
  {#each editor.cues as cue, index (cue.id)}
    {@const issues = editor.issues[index]}
    {@const cps = charactersPerSecond(cue)}
    <article
      id={`cue-${cue.id}`}
      class:active={activeCueId === cue.id}
      class:selected={editor.selectedCueId === cue.id}
      class:invalid={issues.length > 0}
      class="cue-editor"
      onfocusin={() => (editor.selectedCueId = cue.id)}
    >
      <div class="cue-gutter">
        <button
          class="cue-index"
          type="button"
          onclick={() => {
            editor.selectedCueId = cue.id;
            onseek(cue.start_us);
          }}
          aria-label={`Play cue ${index + 1}`}
        >
          {String(index + 1).padStart(2, "0")}
        </button>
        {#if issues.length}
          <span class="cue-warning" title={issues.join(" · ")}>!</span>
        {/if}
      </div>
      <div class="cue-fields">
        <div class="cue-time-fields">
          <label>
            <span>In</span>
            <input
              aria-label={`Cue ${index + 1} start time`}
              value={formatEditorTime(cue.start_us)}
              onfocus={() => editor.beginEdit()}
              onchange={(event) => updateTime(index, "start_us", event)}
              onblur={() => editor.finishEdit()}
              spellcheck="false"
            />
          </label>
          <span aria-hidden="true">→</span>
          <label>
            <span>Out</span>
            <input
              aria-label={`Cue ${index + 1} end time`}
              value={formatEditorTime(cue.end_us)}
              onfocus={() => editor.beginEdit()}
              onchange={(event) => updateTime(index, "end_us", event)}
              onblur={() => editor.finishEdit()}
              spellcheck="false"
            />
          </label>
          <span class="cue-duration"
            >{((cue.end_us - cue.start_us) / 1_000_000).toFixed(2)}s</span
          >
        </div>
        <textarea
          aria-label={`Cue ${index + 1} text`}
          rows="2"
          value={cue.text}
          onfocus={() => editor.beginEdit()}
          oninput={(event) => editor.setText(index, event.currentTarget.value)}
          onselect={(event) => rememberCursor(cue.id, event)}
          onclick={(event) => rememberCursor(cue.id, event)}
          onkeyup={(event) => rememberCursor(cue.id, event)}
          onblur={() => editor.finishEdit()}
          spellcheck="true"
        ></textarea>
        <div class="cue-quality">
          <span class:over-limit={cue.text.length > editor.maxLineLength}>
            {cue.text.length}/{editor.maxLineLength} chars
          </span>
          {#if cps !== null}
            <span>{cps.toFixed(1)} CPS</span>
          {/if}
          {#each issues as issue (issue)}
            <span class="quality-tag">{issue}</span>
          {/each}
        </div>
      </div>
    </article>
  {/each}
  {#if editor.cues.length === 0}
    <div class="empty-cue-list">
      <strong>This track has no cues</strong>
      <p>Insert a cue to continue editing.</p>
      <button
        type="button"
        class="button compact"
        onclick={() => editor.insertAfterSelected()}>Insert first cue</button
      >
    </div>
  {/if}
</div>
