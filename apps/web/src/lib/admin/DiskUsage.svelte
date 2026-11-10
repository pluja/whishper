<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { IconName } from "$lib/components/icon-names";
  import { formatBytes, pluralize } from "$lib/shared/format";
  import type { StorageUsage } from "$lib/shared/storage-usage";

  type Part = {
    label: string;
    detail: string;
    icon: IconName;
    swatch: string;
    bytes: number;
  };

  // Thinner parts would draw only their separator; the list still shows them.
  const MIN_VISIBLE_SHARE = 0.004;

  type Props = { usage: StorageUsage };

  let { usage }: Props = $props();

  const anysubBytes = $derived(
    usage.originals.bytes +
      usage.previews.bytes +
      usage.uploading.bytes +
      usage.databaseBytes,
  );
  const volume = $derived(usage.volume);
  const usedBytes = $derived(
    volume ? volume.totalBytes - volume.availableBytes : anysubBytes,
  );
  const parts = $derived<Part[]>([
    {
      label: "Original media",
      detail: pluralize(usage.originals.count, "upload"),
      icon: "film",
      swatch: "bg-chart-1",
      bytes: usage.originals.bytes,
    },
    {
      label: "Previews and waveforms",
      detail: pluralize(usage.previews.count, "file"),
      icon: "image",
      swatch: "bg-chart-2",
      bytes: usage.previews.bytes,
    },
    {
      label: "Database and unfinished uploads",
      detail: usage.uploading.count
        ? `${pluralize(usage.uploading.count, "upload")} in progress`
        : "Projects, transcripts and settings",
      icon: "database",
      swatch: "bg-chart-3",
      bytes: usage.databaseBytes + usage.uploading.bytes,
    },
    ...(volume
      ? [
          {
            label: "Other files on this disk",
            detail: "Not managed by Anysub",
            icon: "hard-drive" as const,
            swatch: "bg-border-strong",
            bytes: Math.max(usedBytes - anysubBytes, 0),
          },
        ]
      : []),
  ]);
  const summary = $derived(
    volume
      ? `${formatBytes(usedBytes)} used of ${formatBytes(volume.totalBytes)}. ` +
          parts
            .map((part) => `${part.label}: ${formatBytes(part.bytes)}`)
            .join(", ")
      : "",
  );

  function share(bytes: number): string {
    return volume ? `${(bytes / volume.totalBytes) * 100}%` : "0%";
  }
</script>

<div class="grid gap-4">
  {#if volume}
    <div class="grid gap-2">
      <div
        class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
      >
        <span class="text-sm font-medium text-text tabular-nums">
          {formatBytes(volume.availableBytes)} free
        </span>
        <span class="text-xs text-text-muted tabular-nums">
          {formatBytes(usedBytes)} used of {formatBytes(volume.totalBytes)}
        </span>
      </div>
      <div
        class="flex h-2 overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={summary}
      >
        {#each parts.filter((part) => volume && part.bytes / volume.totalBytes >= MIN_VISIBLE_SHARE) as part (part.label)}
          <span
            class="h-full shrink-0 border-r-2 border-surface last:border-r-0 {part.swatch}"
            style:width={share(part.bytes)}
            title={`${part.label}: ${formatBytes(part.bytes)}`}
          ></span>
        {/each}
      </div>
    </div>
  {:else}
    <p class="text-sm text-text-muted">
      The size of the data disk could not be read.
    </p>
  {/if}

  <ul class="divide-y divide-border rounded-md border border-border">
    {#each parts as part (part.label)}
      <li class="flex items-center gap-3 px-3 py-2.5">
        <span
          class="size-2.5 shrink-0 rounded-full {part.swatch}"
          aria-hidden="true"
        ></span>
        <span class="shrink-0 text-text-muted" aria-hidden="true">
          <Icon name={part.icon} size={16} />
        </span>
        <span class="grid min-w-0 flex-1">
          <span class="text-sm text-text">{part.label}</span>
          <span class="text-xs text-text-muted">{part.detail}</span>
        </span>
        <span class="shrink-0 text-sm font-medium text-text tabular-nums">
          {formatBytes(part.bytes)}
        </span>
      </li>
    {/each}
  </ul>
</div>
