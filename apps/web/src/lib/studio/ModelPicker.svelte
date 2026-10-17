<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import type { BadgeTone } from "$lib/components/ui/variants";
  import { formatBytes } from "$lib/shared/format";
  import {
    defaultModelKey,
    type AvailableTranscriptionModel,
    type DetectedWorkerHardware,
    type ModelFit,
  } from "$lib/shared/transcription-models";

  const FIT_TONES: Record<ModelFit, BadgeTone> = {
    good: "success",
    caution: "warning",
    poor: "danger",
    unknown: "neutral",
  };

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
  };

  let { models, hardware }: Props = $props();

  const uid = $props.id();
  let modelPicker = $state<HTMLElement>();
  let modelPickerOpen = $state(false);
  let pickedModelKey = $state<string>();
  let selectedModelKey = $derived(
    models.find((model) => model.key === pickedModelKey)?.key ??
      defaultModelKey(models),
  );
  let recommendedModel = $derived(models.find((model) => model.recommended));
  let selectedModel = $derived(
    models.find((model) => model.key === selectedModelKey),
  );

  function formatModelMemory(
    bytes: number | null,
    kind: "ram" | "vram" | null,
  ): string {
    if (
      typeof bytes !== "number" ||
      !Number.isFinite(bytes) ||
      bytes <= 0 ||
      (kind !== "ram" && kind !== "vram")
    ) {
      return "Memory use unknown";
    }
    return `~${formatBytes(bytes)} ${kind.toUpperCase()}`;
  }

  function handleModelPickerToggle(event: ToggleEvent): void {
    modelPickerOpen = event.newState === "open";
  }

  function selectTranscriptionModel(modelKey: string): void {
    pickedModelKey = modelKey;
    modelPicker?.hidePopover();
  }
</script>

{#snippet hardwareCard(kind: string | null, name: string, specs: string)}
  <li
    class="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5 rounded-md border border-border bg-surface-sunken px-2.5 py-2"
  >
    <span
      class="grid size-7 place-items-center rounded-md bg-accent-soft text-accent"
      aria-hidden="true"
    >
      <Icon name="cpu" size={16} />
    </span>
    <span class="grid min-w-0 gap-0.5">
      <span class="text-xs text-text-muted">
        {kind ? `Detected hardware · ${kind}` : "Detected hardware"}
      </span>
      <strong class="text-sm font-medium break-words text-text">{name}</strong>
      <span class="text-xs break-words text-text-muted">{specs}</span>
    </span>
  </li>
{/snippet}

{#snippet fitBadge(model: AvailableTranscriptionModel | undefined, id?: string)}
  <span {id} class="shrink-0">
    <Badge tone={FIT_TONES[model?.fit ?? "unknown"]}>
      <Icon name="cpu" size={12} />
      {model?.recommended ? "Recommended" : model?.fitLabel || "Not checked"}
    </Badge>
  </span>
{/snippet}

<div class="grid min-w-0 gap-1.5">
  <span id={`${uid}-label`} class="text-sm font-medium text-text">Model</span>
  <input type="hidden" name="model" value={selectedModelKey} />
  <button
    class="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-expanded:border-accent motion-reduce:transition-none"
    type="button"
    popovertarget={`${uid}-options`}
    aria-haspopup="dialog"
    aria-expanded={modelPickerOpen}
    aria-controls={`${uid}-options`}
    aria-labelledby={`${uid}-label ${uid}-selection ${uid}-selection-fit ${uid}-selection-description`}
  >
    <span class="grid min-w-0 flex-1 gap-1">
      <span class="flex min-w-0 items-center gap-2">
        <strong
          id={`${uid}-selection`}
          class="min-w-0 flex-1 truncate text-sm font-semibold text-text"
        >
          {selectedModel?.displayName ?? "Choose a model"}
        </strong>
        {@render fitBadge(selectedModel, `${uid}-selection-fit`)}
      </span>
      <span
        id={`${uid}-selection-description`}
        class="text-xs break-words text-text-muted"
      >
        {selectedModel?.description ?? "Description unavailable."}
      </span>
    </span>
    <span
      class="shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none {modelPickerOpen
        ? 'rotate-180'
        : ''}"
    >
      <Icon name="chevron-down" size={18} />
    </span>
  </button>
  <ul class="grid min-w-0 gap-1.5" aria-label="Detected hardware">
    {#each hardware as device (device)}
      {@render hardwareCard(
        device.kind,
        device.name,
        device.details.length
          ? device.details.join(" · ")
          : "Details unavailable",
      )}
    {:else}
      {@render hardwareCard(
        null,
        "Details unavailable",
        "CPU and GPU details were not reported.",
      )}
    {/each}
  </ul>
  <div
    class="inset-auto m-0 mb-1 max-h-[min(36rem,calc(100dvh-1.5rem))] w-[min(28rem,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-surface-raised p-0 text-text shadow-lg [position-area:block-start_span-inline-end] [position-try-fallbacks:flip-block,flip-inline] open:grid not-supports-[position-area:block-start]:top-1/2 not-supports-[position-area:block-start]:left-1/2 not-supports-[position-area:block-start]:-translate-1/2"
    id={`${uid}-options`}
    bind:this={modelPicker}
    popover
    role="dialog"
    aria-labelledby={`${uid}-dialog-title`}
    aria-describedby={`${uid}-dialog-subtitle`}
    ontoggle={handleModelPickerToggle}
  >
    <div class="grid gap-0.5 border-b border-border px-3 py-2.5">
      <strong id={`${uid}-dialog-title`} class="text-sm font-semibold">
        Choose a model
      </strong>
      <span id={`${uid}-dialog-subtitle`} class="text-xs text-text-muted">
        {#if recommendedModel}
          {recommendedModel.displayName} is the best fit for your connected hardware.
        {:else}
          Small is the best starting point for most videos.
        {/if}
      </span>
    </div>
    <div
      class="grid min-h-0 overflow-y-auto"
      role="listbox"
      aria-labelledby={`${uid}-dialog-title`}
    >
      {#each models as model (model.key)}
        {@const downloadLabel =
          model.downloaded === true
            ? "Downloaded"
            : model.downloaded === false
              ? "Needs download"
              : "Download status unavailable"}
        <button
          class="grid w-full gap-1 border-t border-border px-3 py-2 text-left break-words first:border-t-0 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:shadow-[inset_3px_0_var(--color-focus)] focus-visible:outline-none aria-selected:bg-accent-soft aria-selected:shadow-[inset_3px_0_var(--color-accent)]"
          type="button"
          role="option"
          aria-selected={model.key === selectedModelKey}
          onclick={() => selectTranscriptionModel(model.key)}
        >
          <span class="flex min-w-0 items-start justify-between gap-2">
            <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <strong class="text-sm font-semibold text-text"
                >{model.displayName}</strong
              >
              <span
                class="inline-flex items-center gap-1 text-xs whitespace-nowrap text-text-muted"
              >
                <span
                  class={model.downloaded === true ? "text-success" : ""}
                  role="img"
                  aria-label={downloadLabel}
                  title={downloadLabel}
                >
                  <Icon name="download" size={14} />
                </span>
                <span class="tabular-nums">
                  {formatModelMemory(
                    model.memoryRequirementBytes,
                    model.memoryRequirementKind,
                  )}
                </span>
              </span>
            </span>
            {@render fitBadge(model)}
          </span>
          <span class="text-xs text-text-muted">
            {model.description ?? "Description unavailable."}
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>
