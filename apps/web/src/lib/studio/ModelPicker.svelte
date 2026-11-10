<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { FIT_TONES } from "$lib/components/model-fit";
  import Picker from "$lib/components/ui/Picker.svelte";
  import { formatBytes } from "$lib/shared/format";
  import {
    defaultModelKey,
    type AvailableTranscriptionModel,
    type DetectedWorkerHardware,
  } from "$lib/shared/transcription-models";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    preferredKey?: string | null;
  };

  let { models, hardware, preferredKey = null }: Props = $props();

  let pickedModelKey = $state<string>();
  let selectedModelKey = $derived(
    models.find((model) => model.key === pickedModelKey)?.key ??
      defaultModelKey(models, preferredKey),
  );
  let recommendedModel = $derived(models.find((model) => model.recommended));

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

{#snippet fitBadge(model: AvailableTranscriptionModel | undefined)}
  <span class="shrink-0">
    <Badge tone={FIT_TONES[model?.fit ?? "unknown"]}>
      <Icon name="cpu" size={12} />
      {model?.recommended ? "Recommended" : model?.fitLabel || "Not checked"}
    </Badge>
  </span>
{/snippet}

<Picker
  label="Model"
  name="model"
  options={models}
  key={(model) => model.key}
  optionText={(model) => model.displayName}
  bind:value={() => selectedModelKey, (key) => (pickedModelKey = key)}
  title="Choose a model"
  subtitle={recommendedModel
    ? `${recommendedModel.displayName} is the best fit for your connected hardware.`
    : "Small is the best starting point for most videos."}
  divided
>
  {#snippet selection(model)}
    <span class="grid gap-1">
      <span class="flex min-w-0 items-center gap-2">
        <strong class="min-w-0 flex-1 truncate text-sm font-semibold text-text">
          {model?.displayName ?? "Choose a model"}
        </strong>
        {@render fitBadge(model)}
      </span>
      <span class="text-xs break-words text-text-muted">
        {model?.description ?? "Description unavailable."}
      </span>
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
    </span>
  {/snippet}
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
</Picker>
