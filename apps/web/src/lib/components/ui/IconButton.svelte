<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Icon from "../Icon.svelte";
  import type { IconName } from "../icon-names";
  import {
    buttonClasses,
    type ButtonSize,
    type ButtonVariant,
  } from "./variants";

  type Props = Omit<HTMLButtonAttributes, "children" | "aria-label"> & {
    label: string;
    icon: IconName;
    shortcut?: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
  };

  let {
    label,
    icon,
    shortcut,
    variant = "ghost",
    size = "md",
    class: extra = "",
    ...rest
  }: Props = $props();

  const classes = $derived(`${buttonClasses(variant, size, true)} ${extra}`);
</script>

<button
  type="button"
  {...rest}
  class={classes}
  aria-label={label}
  title={shortcut ? `${label} (${shortcut})` : label}
>
  <Icon name={icon} size={size === "sm" ? 16 : 18} />
</button>
