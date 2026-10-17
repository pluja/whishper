<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { CONTROL_CLASSES } from "./variants";

  let {
    value = $bindable(),
    class: extra = "",
    ...rest
  }: HTMLTextareaAttributes = $props();
</script>

<textarea bind:value {...rest} class="{CONTROL_CLASSES} py-2 {extra}"
></textarea>
