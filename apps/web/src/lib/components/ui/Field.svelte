<script lang="ts">
  import type { Snippet } from "svelte";

  type ControlArgs = {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  };
  type Props = {
    label: string;
    hint?: string | Snippet;
    error?: string;
    control: Snippet<[ControlArgs]>;
  };

  let { label, hint, error, control }: Props = $props();

  const id = $props.id();
  const describedBy = $derived(
    error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  );
</script>

<div class="grid gap-1.5">
  <label for={id} class="text-sm font-medium text-text">{label}</label>
  {@render control({ id, describedBy, invalid: Boolean(error) })}
  {#if error}
    <p id="{id}-error" class="text-sm text-danger" role="alert">{error}</p>
  {:else if hint}
    <p id="{id}-hint" class="text-sm text-text-muted">
      {#if typeof hint === "string"}{hint}{:else}{@render hint()}{/if}
    </p>
  {/if}
</div>
