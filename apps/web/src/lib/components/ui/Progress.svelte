<script lang="ts">
  type Props = { value?: number; label: string };

  let { value, label }: Props = $props();

  const percent = $derived(
    value === undefined
      ? undefined
      : Math.round(Math.min(Math.max(value, 0), 1) * 100),
  );
</script>

<div
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={percent}
  class="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
>
  <div
    class="h-full rounded-full bg-accent transition-[width] duration-200 {percent ===
    undefined
      ? 'w-full animate-pulse motion-reduce:animate-none'
      : ''}"
    style:width={percent === undefined ? undefined : `${percent}%`}
  ></div>
</div>
