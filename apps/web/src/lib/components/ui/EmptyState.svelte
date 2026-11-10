<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../Icon.svelte";
  import type { IconName } from "../icon-names";

  type Props = {
    icon: IconName;
    title: string;
    tone?: "neutral" | "accent";
    children: Snippet;
  };

  const TONE_CLASSES = {
    neutral: "bg-surface-sunken text-text-muted",
    accent: "bg-accent-soft text-accent",
  };

  let { icon, title, tone = "neutral", children }: Props = $props();
</script>

<div
  class="grid justify-items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center"
>
  <span
    class="grid size-11 place-items-center rounded-full {TONE_CLASSES[tone]}"
    aria-hidden="true"
  >
    <Icon name={icon} size={22} />
  </span>
  <h3 class="text-base font-semibold text-text">{title}</h3>
  <div class="grid max-w-md justify-items-center gap-2 text-sm text-text-muted">
    {@render children()}
  </div>
</div>
