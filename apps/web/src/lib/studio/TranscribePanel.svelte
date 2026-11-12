<script lang="ts" module>
  import type { AvailableTranscriptionModel } from "#lib/shared/transcription-models.ts";

  export function processingNote(
    models: AvailableTranscriptionModel[],
  ): string {
    return models.some((model) => model.remote)
      ? "Local models run on your worker. A provider's model sends the audio to that provider."
      : "Processing stays on your connected worker. No media leaves Anysub.";
  }
</script>

<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import {
    MAX_LINE_LENGTH,
    MIN_LINE_LENGTH,
    type TranscriptionDefaults,
  } from "#lib/shared/instance-settings.ts";
  import { DETECT_LANGUAGE } from "#lib/shared/languages.ts";
  import { MAX_BATCH_SIZE } from "#lib/shared/limits.ts";
  import { formatDuration } from "#lib/shared/format.ts";
  import {
    formatPricePerMinute,
    formatUsd,
    priceForDuration,
  } from "#lib/shared/money.ts";
  import {
    acceptsOption,
    defaultModelKey,
    type DetectedWorkerHardware,
  } from "#lib/shared/transcription-models.ts";
  import LanguagePicker from "./LanguagePicker.svelte";
  import ModelPicker from "./ModelPicker.svelte";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    defaults: TranscriptionDefaults;
    mediaDurationUs?: number | null;
    // Resolves to an error message when the transcription must not start.
    onbeforesubmit?: () => Promise<string | null>;
  };

  let {
    models,
    hardware,
    defaults,
    mediaDurationUs = null,
    onbeforesubmit,
  }: Props = $props();

  let pickedModelKey = $state<string>();
  const defaultKey = $derived(defaultModelKey(models, defaults.model));
  const selectedModel = $derived(
    models.find((model) => model.key === pickedModelKey) ??
      models.find((model) => model.key === defaultKey),
  );
  const accepts = (option: string) =>
    selectedModel ? acceptsOption(selectedModel.optionsSchema, option) : true;
  const remote = $derived(selectedModel?.remote ?? null);
  const estimatedCost = $derived(
    remote?.priceMicrosPerMinute != null && mediaDurationUs
      ? priceForDuration(remote.priceMicrosPerMinute, mediaDurationUs)
      : null,
  );
  // Held here so the choice survives picking a remote model, which hides it.
  // svelte-ignore state_referenced_locally
  let alignment = $state(defaults.alignment);

  let preparing = $state(false);
  let blockedMessage = $state<string | null>(null);

  function revealAdvancedOptions(
    event: Event & { currentTarget: HTMLDetailsElement },
  ): void {
    if (event.currentTarget.open) {
      event.currentTarget.lastElementChild?.scrollIntoView({
        block: "nearest",
      });
    }
  }

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
    class="grid"
    method="POST"
    action="?/transcribe"
    onsubmit={handleSubmit}
  >
    <div class="grid gap-4 pb-4">
      <ModelPicker
        {models}
        {hardware}
        selectedKey={selectedModel?.key ?? ""}
        onpick={(key) => (pickedModelKey = key)}
      />
      <LanguagePicker initial={defaults.language ?? DETECT_LANGUAGE} />
      <div class="grid gap-2">
        {#if accepts("alignment")}
          <label class="flex cursor-pointer items-start gap-2.5">
            <input
              class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              name="alignment"
              type="checkbox"
              bind:checked={alignment}
            />
            <span class="grid gap-0.5">
              <span class="text-sm font-medium text-text">
                Accurate word alignment
              </span>
              <span class="text-xs text-text-muted">
                For editing, highlights and karaoke.
              </span>
            </span>
          </label>
        {/if}
        <details class="group" ontoggle={revealAdvancedOptions}>
          <summary
            class="flex w-fit cursor-pointer list-none items-center gap-2.5 rounded-sm text-sm font-medium text-text-muted transition-colors duration-150 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
          >
            <span
              class="grid size-4 place-items-center transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden="true"
            >
              <Icon name="chevron-right" size={16} />
            </span>
            Advanced options
          </summary>
          <!-- The bottom scroll margin clears the pinned start button. -->
          <div class="grid scroll-mb-18 grid-cols-2 gap-3 pt-3">
            <Field label="Line length" hint="Characters per line.">
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
            {#if accepts("batchSize")}
              <Field label="Batch size" hint="Lower it if memory runs out.">
                {#snippet control({ id, describedBy })}
                  <Input
                    {id}
                    aria-describedby={describedBy}
                    name="batchSize"
                    type="number"
                    min="1"
                    max={MAX_BATCH_SIZE}
                    placeholder="Automatic"
                  />
                {/snippet}
              </Field>
            {/if}
          </div>
        </details>
      </div>
    </div>
    <div
      class="sticky bottom-0 grid gap-2 border-t border-border bg-surface pt-4 pb-4 in-[dialog]:bg-surface-raised in-[dialog]:pb-0"
    >
      {#if remote}
        <p class="flex items-start gap-1.5 text-xs text-text-muted">
          <span class="mt-px shrink-0" aria-hidden="true">
            <Icon name="globe" size={14} />
          </span>
          <span>
            Sends the audio to {remote.providerName} at {remote.host}.
            {#if estimatedCost !== null && mediaDurationUs !== null}
              About {formatUsd(estimatedCost)} for {formatDuration(
                mediaDurationUs,
              )}.
            {:else if remote.priceMicrosPerMinute !== null}
              {formatPricePerMinute(remote.priceMicrosPerMinute)}.
            {/if}
          </span>
        </p>
      {/if}
      {#if blockedMessage}
        <p class="text-sm text-danger" role="alert">{blockedMessage}</p>
      {/if}
      <Button
        variant="primary"
        type="submit"
        class="w-full"
        loading={preparing}
      >
        <Icon name="activity" size={16} />
        Start transcription
      </Button>
    </div>
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
