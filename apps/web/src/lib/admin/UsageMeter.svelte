<script lang="ts">
  import { formatBytes } from "#lib/shared/format.ts";

  type Props = { label: string; usedBytes: number; totalBytes: number };

  let { label, usedBytes, totalBytes }: Props = $props();

  const share = $derived(
    totalBytes > 0 ? Math.min(Math.max(usedBytes / totalBytes, 0), 1) : 0,
  );
  const fill = $derived(
    share >= 0.97 ? "bg-danger" : share >= 0.9 ? "bg-warning" : "bg-accent",
  );
  const freeBytes = $derived(Math.max(totalBytes - usedBytes, 0));
</script>

<div class="grid min-w-0 gap-2">
  <div class="flex items-baseline justify-between gap-3">
    <span class="text-xs text-text-muted">{label}</span>
    <span class="text-sm font-medium text-text tabular-nums">
      {formatBytes(freeBytes)} free
    </span>
  </div>
  <div
    role="meter"
    aria-label={label}
    aria-valuemin="0"
    aria-valuemax={totalBytes}
    aria-valuenow={usedBytes}
    aria-valuetext={`${formatBytes(usedBytes)} used of ${formatBytes(totalBytes)}`}
    class="h-2 overflow-hidden rounded-full bg-accent-soft"
  >
    <div
      class="h-full rounded-full {fill}"
      style:width={`${share * 100}%`}
    ></div>
  </div>
  <span class="text-xs text-text-muted tabular-nums">
    {formatBytes(usedBytes)} used of {formatBytes(totalBytes)}
  </span>
</div>
