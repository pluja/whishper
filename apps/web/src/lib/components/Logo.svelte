<script lang="ts">
  type Props = { size?: number };

  let { size = 24 }: Props = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
  <rect x="2" y="2" width="60" height="60" rx="16" class="fill-accent" />
  <g class="stroke-accent-fg" stroke-width="6.5" stroke-linecap="round">
    <line x1="32" y1="26" x2="32" y2="13.5" />
    <line x1="32" y1="26" x2="43.89" y2="22.14" />
    <line x1="32" y1="26" x2="20.11" y2="22.14" />
    <line x1="32" y1="26" x2="39.35" y2="36.11" />
    <line x1="32" y1="26" x2="24.65" y2="36.11" />
  </g>
  <rect x="15" y="45" width="34" height="6" rx="3" class="fill-accent-fg" />
</svg>
