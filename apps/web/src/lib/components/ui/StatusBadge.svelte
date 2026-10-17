<script lang="ts">
  import { stateLabel, statusTone } from "$lib/shared/project-status";
  import Badge from "./Badge.svelte";
  import Progress from "./Progress.svelte";

  type Props = { status: string; progress?: number | null };

  let { status, progress = null }: Props = $props();

  const label = $derived(stateLabel(status));
</script>

<span class="inline-flex flex-col gap-1">
  <Badge tone={statusTone(status)}>
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
    {label}
  </Badge>
  {#if progress !== null}
    <Progress value={progress} label={`${label} progress`} />
  {/if}
</span>
