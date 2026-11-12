<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ProviderIcon from "#lib/components/provider-icons/ProviderIcon.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import { FIT_TONES } from "#lib/components/model-fit.ts";
  import Picker from "#lib/components/ui/Picker.svelte";
  import { formatBytes } from "#lib/shared/format.ts";
  import { formatPricePerMinute } from "#lib/shared/money.ts";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "#lib/shared/transcription-models.ts";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    selectedKey: string;
    onpick: (key: string) => void;
  };

  let { models, hardware, selectedKey, onpick }: Props = $props();

  let recommendedModel = $derived(models.find((model) => model.recommended));
  // Headings only when both kinds are on offer.
  const hasBothKinds = $derived(
    models.some((model) => model.remote) &&
      models.some((model) => !model.remote),
  );
  let selectedModel = $derived(
    models.find((model) => model.key === selectedKey),
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
</script>

{#snippet fitBadge(model: AvailableTranscriptionModel | undefined)}
  {#if !model?.remote}
    <span class="shrink-0">
      <Badge tone={FIT_TONES[model?.fit ?? "unknown"]}>
        <Icon name="cpu" size={12} />
        {model?.recommended ? "Recommended" : model?.fitLabel || "Not checked"}
      </Badge>
    </span>
  {/if}
{/snippet}

<!-- An external model starts with its provider, so it never reads as local. -->
{#snippet modelName(model: AvailableTranscriptionModel)}
  {#if model.remote}
    <span class="inline-flex shrink-0 items-center gap-1.5 text-text-muted">
      <ProviderIcon
        name={model.remote.providerName}
        brand={model.remote.brand}
        size={14}
      />
      {model.remote.providerName}
      <span aria-hidden="true">·</span>
    </span>
  {/if}
  <span class="min-w-0 truncate">{model.displayName}</span>
{/snippet}

<Picker
  label="Model"
  name="model"
  options={models}
  key={(model) => model.key}
  group={hasBothKinds
    ? (model) => (model.remote ? "External providers" : "Local models")
    : undefined}
  optionText={(model) => model.displayName}
  bind:value={() => selectedKey, onpick}
  title="Choose a model"
  subtitle={recommendedModel
    ? `${recommendedModel.displayName} is the best fit for your connected hardware.`
    : models.some((model) => !model.remote)
      ? "Small is the best starting point for most videos."
      : "These models run on your providers' servers."}
  divided
>
  {#snippet selection(model)}
    <span class="flex min-w-0 items-center gap-2">
      <span
        class="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-text"
      >
        {#if model}
          {@render modelName(model)}
        {:else}
          Choose a model
        {/if}
      </span>
      {@render fitBadge(model)}
    </span>
  {/snippet}
  {#snippet option(model)}
    {@const downloadLabel =
      model.downloaded === true
        ? "Downloaded"
        : model.downloaded === false
          ? "Needs download"
          : "Download status unavailable"}
    <span class="grid gap-1">
      <span class="flex min-w-0 items-start justify-between gap-2">
        <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <strong
            class="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-text"
          >
            {@render modelName(model)}
          </strong>
          <span
            class="inline-flex items-center gap-1 text-xs whitespace-nowrap text-text-muted"
          >
            {#if model.remote}
              <span class="tabular-nums">
                {model.remote.priceMicrosPerMinute === null
                  ? "Price not set"
                  : formatPricePerMinute(model.remote.priceMicrosPerMinute)}
              </span>
            {:else}
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
            {/if}
          </span>
        </span>
        {@render fitBadge(model)}
      </span>
      <span class="text-xs text-text-muted">
        {model.description ?? "Description unavailable."}
      </span>
    </span>
  {/snippet}
  <div class="grid gap-1 text-xs text-text-muted">
    {#if selectedModel?.remote}
      <p class="flex items-start gap-1.5">
        <span class="mt-px shrink-0" aria-hidden="true">
          <Icon name="globe" size={14} />
        </span>
        {selectedModel.fitReason}
      </p>
    {:else}
      <ul class="grid gap-1" aria-label="Detected hardware">
        {#each hardware as device (device)}
          <li class="flex items-start gap-1.5">
            <span class="mt-px shrink-0" aria-hidden="true">
              <Icon name="cpu" size={14} />
            </span>
            <span class="min-w-0 break-words">
              {[device.name, ...device.details].join(" · ")}
            </span>
          </li>
        {:else}
          <li>Hardware details unavailable</li>
        {/each}
      </ul>
    {/if}
    {#if selectedModel?.downloaded === false}
      <p class="flex items-start gap-1.5">
        <span class="mt-px shrink-0" aria-hidden="true">
          <Icon name="download" size={14} />
        </span>
        {selectedModel.downloadSizeBytes
          ? `First use downloads ${formatBytes(selectedModel.downloadSizeBytes)}.`
          : "First use downloads the model."}
      </p>
    {/if}
  </div>
</Picker>
