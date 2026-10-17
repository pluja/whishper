<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { CONTROL_CLASSES } from "./variants";

  let {
    value = $bindable(),
    class: extra = "",
    ...rest
  }: HTMLInputAttributes = $props();
</script>

<input bind:value {...rest} class="{CONTROL_CLASSES} h-9 {extra}" />
