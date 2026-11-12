<script lang="ts">
  import { keepFocusThrough } from "#lib/browser/focus.ts";
  import { parseEditorTime } from "#lib/shared/subtitles.ts";
  import {
    eraseBackward,
    eraseForward,
    formatTimecode,
    overtype,
    parsePastedTimecode,
    stepTimecode,
    type TimecodeEdit,
  } from "./timecode";

  type Props = {
    value: number;
    // Steps stop here when it is positive, such as at the end of the source.
    max?: number;
    label: string;
    onchange: (microseconds: number) => void;
    validate?: (microseconds: number) => string | null;
    onerror?: (message: string | null) => void;
    invalid?: boolean;
    describedBy?: string;
    readonly?: boolean;
    class?: string;
    onfocus?: () => void;
    onblur?: () => void;
  };

  let {
    value,
    max = 0,
    label,
    onchange,
    validate,
    onerror,
    invalid = false,
    describedBy,
    readonly = false,
    class: extra = "",
    onfocus,
    onblur,
  }: Props = $props();

  const PASTE_ERROR = "Paste a time such as 1:02.5 or 00:01:02.500.";

  let input: HTMLInputElement;
  const committedText = $derived(formatTimecode(value));
  let draft = $derived(committedText);

  // Writes the DOM first so Svelte sees an unchanged value and keeps the caret.
  // Safari focuses an input whose selection is set, so a blurred one is skipped.
  function show({ text, caret }: TimecodeEdit): void {
    input.value = text;
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
    draft = text;
  }

  function draftMicroseconds(): number {
    return parseEditorTime(draft) ?? value;
  }

  function clearError(): void {
    if (invalid) onerror?.(null);
  }

  function editDraft(edit: TimecodeEdit | null): void {
    if (!edit) return;
    show(edit);
    if (invalid && !validate?.(draftMicroseconds())) onerror?.(null);
  }

  let changing = false;

  // A change can re-sort the rows. Blur handling waits until the field has
  // taken its focus back, so the edit session keeps running.
  async function changeInPlace(microseconds: number): Promise<void> {
    const caret = input.selectionStart ?? 0;
    changing = true;
    if (await keepFocusThrough(input, () => onchange(microseconds))) {
      input.setSelectionRange(caret, caret);
    }
    changing = false;
  }

  function commit(inPlace = false): boolean {
    if (draft === committedText) {
      clearError();
      return true;
    }
    const microseconds = draftMicroseconds();
    const message = validate?.(microseconds) ?? null;
    if (message) {
      onerror?.(message);
      return false;
    }
    if (inPlace) void changeInPlace(microseconds);
    else onchange(microseconds);
    clearError();
    return true;
  }

  function revert(): void {
    show({ text: committedText, caret: input.selectionStart ?? 0 });
    clearError();
  }

  function step(direction: 1 | -1, large: boolean): void {
    const caret = input.selectionStart ?? 0;
    const microseconds = stepTimecode(
      draftMicroseconds(),
      caret,
      direction,
      large,
      max,
    );
    const message = validate?.(microseconds) ?? null;
    if (message) {
      onerror?.(message);
      return;
    }
    show({ text: formatTimecode(microseconds), caret });
    if (microseconds !== value) void changeInPlace(microseconds);
    clearError();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.isComposing || readonly || event.altKey) return;
    const modified = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") {
      revert();
    } else if (!modified && event.key === "Enter") {
      event.preventDefault();
      commit(true);
    } else if (
      !modified &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      step(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
    } else if (
      modified &&
      !event.shiftKey &&
      event.key.toLowerCase() === "z" &&
      draft !== committedText
    ) {
      // Discard the uncommitted digits before undo reaches committed edits.
      event.preventDefault();
      revert();
    }
  }

  // Every native edit is cancelled and replayed on the mask, which also
  // covers virtual keyboards that send no usable keydown.
  function handleBeforeInput(event: InputEvent): void {
    if (readonly) return;
    event.preventDefault();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (event.inputType === "insertText") {
      editDraft(overtype(draft, start, event.data ?? ""));
    } else if (event.inputType === "deleteContentBackward") {
      editDraft(eraseBackward(draft, start, end));
    } else if (event.inputType === "deleteContentForward") {
      editDraft(eraseForward(draft, start, end));
    }
  }

  // An IME composition cannot be cancelled, so its result is undone here.
  function handleInput(): void {
    if (input.value !== draft) {
      show({ text: draft, caret: input.selectionStart ?? 0 });
    }
  }

  function handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    if (readonly) return;
    const microseconds = parsePastedTimecode(
      event.clipboardData?.getData("text/plain") ?? "",
    );
    if (microseconds === null) {
      onerror?.(PASTE_ERROR);
      return;
    }
    const text = formatTimecode(microseconds);
    editDraft({ text, caret: text.length });
  }

  function handleBlur(): void {
    if (changing) return;
    if (!commit()) revert();
    onblur?.();
  }
</script>

<input
  bind:this={input}
  class="font-mono tabular-nums {extra}"
  type="text"
  value={draft}
  aria-label={label}
  aria-invalid={invalid || undefined}
  aria-describedby={describedBy}
  inputmode="numeric"
  spellcheck="false"
  autocomplete="off"
  data-no-native-undo
  {readonly}
  {onfocus}
  onblur={handleBlur}
  onkeydown={handleKeydown}
  onbeforeinput={handleBeforeInput}
  oninput={handleInput}
  onpaste={handlePaste}
/>
