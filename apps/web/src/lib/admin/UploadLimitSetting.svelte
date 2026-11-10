<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { formatBytes } from "$lib/shared/format";
  import {
    GIB,
    MAX_UPLOAD_LIMIT_GIB,
    MIN_UPLOAD_LIMIT_GIB,
    UPLOAD_LIMIT_PRESETS_GIB,
  } from "$lib/shared/instance-settings";

  const CUSTOM = "custom";

  type Props = {
    initialBytes: number;
    freeBytes: number | null;
    error: { field: string; message: string } | null;
  };

  let { initialBytes, freeBytes, error }: Props = $props();

  const id = $props.id();
  // svelte-ignore state_referenced_locally
  let choice = $state(
    UPLOAD_LIMIT_PRESETS_GIB.some((preset) => preset === initialBytes / GIB)
      ? String(initialBytes / GIB)
      : CUSTOM,
  );
  // svelte-ignore state_referenced_locally
  let custom = $state(Math.round((initialBytes / GIB) * 10) / 10);

  const chosenBytes = $derived(
    (choice === CUSTOM ? Number(custom) : Number(choice)) * GIB,
  );
  const exceedsDisk = $derived(
    freeBytes !== null &&
      Number.isFinite(chosenBytes) &&
      chosenBytes > freeBytes,
  );

  function presetLabel(gibibytes: number): string {
    return gibibytes >= 1024 ? `${gibibytes / 1024} TiB` : `${gibibytes} GiB`;
  }
</script>

<div class="grid gap-3">
  <fieldset class="flex flex-wrap gap-2" aria-describedby="{id}-hint">
    <legend class="sr-only">Largest upload</legend>
    {#each [...UPLOAD_LIMIT_PRESETS_GIB.map(String), CUSTOM] as option (option)}
      <label
        class="inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus motion-reduce:transition-none {choice ===
        option
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border-strong text-text hover:bg-surface-sunken'}"
      >
        <input
          type="radio"
          name="uploadLimit"
          value={option}
          bind:group={choice}
          class="sr-only"
        />
        {option === CUSTOM ? "Custom" : presetLabel(Number(option))}
      </label>
    {/each}
  </fieldset>

  {#if choice === CUSTOM}
    <div class="flex max-w-56 items-center gap-2">
      <label for="{id}-custom" class="sr-only">Custom limit in GiB</label>
      <Input
        id="{id}-custom"
        name="customUploadLimit"
        type="number"
        min={MIN_UPLOAD_LIMIT_GIB}
        max={MAX_UPLOAD_LIMIT_GIB}
        step="0.1"
        required
        bind:value={custom}
        aria-invalid={error?.field === "customUploadLimit"}
      />
      <span class="text-sm text-text-muted">GiB</span>
    </div>
  {/if}

  <p id="{id}-hint" class="text-sm text-text-muted">
    An hour of 1080p phone video is usually a few GiB. Camera originals can be
    much larger.
  </p>
  {#if exceedsDisk && freeBytes !== null}
    <p class="flex items-start gap-1.5 text-sm text-warning">
      <span class="mt-0.5 shrink-0"><Icon name="alert" size={16} /></span>
      Larger than the {formatBytes(freeBytes)} left on the data disk. An upload that
      fills the disk fails.
    </p>
  {/if}
  {#if error}
    <p class="text-sm text-danger" role="alert">{error.message}</p>
  {/if}
</div>
