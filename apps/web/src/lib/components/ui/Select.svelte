<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { CONTROL_CLASSES } from "./variants";

  let {
    value = $bindable(),
    class: extra = "",
    children,
    ...rest
  }: HTMLSelectAttributes = $props();
</script>

<select bind:value {...rest} class="{CONTROL_CLASSES} h-9 {extra}">
  {@render children?.()}
</select>
