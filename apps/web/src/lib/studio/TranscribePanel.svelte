<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import {
    MAX_LINE_LENGTH,
    MIN_LINE_LENGTH,
    type TranscriptionDefaults,
  } from "$lib/shared/instance-settings";
  import { DETECT_LANGUAGE } from "$lib/shared/languages";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "$lib/shared/transcription-models";
  import LanguagePicker from "./LanguagePicker.svelte";
  import ModelPicker from "./ModelPicker.svelte";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    defaults: TranscriptionDefaults;
    // Resolves to an error message when the transcription must not start.
    onbeforesubmit?: () => Promise<string | null>;
  };

  let { models, hardware, defaults, onbeforesubmit }: Props = $props();

  let preparing = $state(false);
  let blockedMessage = $state<string | null>(null);

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    if (!onbeforesubmit) return;
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    preparing = true;
    blockedMessage = await onbeforesubmit();
    if (blockedMessage) {
      preparing = false;
      return;
    }
    form.submit();
  }
</script>

{#if models.length}
  <form
    class="grid gap-4"
    method="POST"
    action="?/transcribe"
    onsubmit={handleSubmit}
  >
    <p class="text-sm text-text-muted">
      Choose the accuracy and resource profile for this source. The first run
      downloads its model into the private cache.
    </p>
    <ModelPicker {models} {hardware} preferredKey={defaults.model} />
    <LanguagePicker initial={defaults.language ?? DETECT_LANGUAGE} />
    <label
      class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2.5"
    >
      <input
        class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        name="alignment"
        type="checkbox"
        checked={defaults.alignment}
      />
      <span class="grid gap-0.5">
        <span class="text-sm font-medium text-text"
          >Accurate word alignment</span
        >
        <span class="text-xs text-text-muted">
          Recommended for editing, highlights, and karaoke.
        </span>
      </span>
    </label>
    <details class="group rounded-md border border-border">
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
      >
        Advanced options
        <span
          class="text-text-muted transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        >
          <Icon name="chevron-down" size={16} />
        </span>
      </summary>
      <div class="grid gap-4 border-t border-border px-3 py-3">
        <Field
          label="Maximum line length"
          hint={`${DEFAULT_MAX_LINE_LENGTH} characters is a readable subtitle default. Splits preserve whole words.`}
        >
          {#snippet control({ id, describedBy })}
            <Input
              {id}
              aria-describedby={describedBy}
              name="maxLineLength"
              type="number"
              min={MIN_LINE_LENGTH}
              max={MAX_LINE_LENGTH}
              value={defaults.maxLineLength}
              required
            />
          {/snippet}
        </Field>
        <Field
          label="Batch size"
          hint="Lower this only if the worker runs out of memory."
        >
          {#snippet control({ id, describedBy })}
            <Input
              {id}
              aria-describedby={describedBy}
              name="batchSize"
              type="number"
              min="1"
              max="64"
              placeholder="Automatic"
            />
          {/snippet}
        </Field>
      </div>
    </details>
    {#if blockedMessage}
      <p class="text-sm text-danger" role="alert">{blockedMessage}</p>
    {/if}
    <Button variant="primary" type="submit" class="w-full" loading={preparing}>
      <Icon name="activity" size={16} />
      Start transcription
    </Button>
    <p class="text-xs text-text-muted">
      Processing stays on your connected worker. No media leaves Anysub.
    </p>
  </form>
{:else}
  <div class="grid gap-3">
    <p class="text-sm text-text-muted">
      A transcription worker is not connected yet. Start or inspect the worker
      container, then this page will offer its models.
    </p>
    <Button class="w-full" disabled>Waiting for a speech worker</Button>
    <p class="text-xs text-text-muted">Model choices appear automatically.</p>
  </div>
{/if}
