<script lang="ts">
  import { getThemeController } from "#lib/browser/theme.svelte.ts";
  import type { ThemePreference } from "#lib/shared/theme.ts";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icon-names";
  import Menu from "./ui/Menu.svelte";
  import MenuItem from "./ui/MenuItem.svelte";
  import { buttonClasses } from "./ui/variants";

  const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "monitor" },
  ];

  const theme = getThemeController();
</script>

<Menu label="Theme" align="end">
  {#snippet trigger(args)}
    <button
      type="button"
      {...args}
      class={buttonClasses("ghost", "md", true)}
      aria-label="Theme"
      title="Theme"
    >
      <!-- Swapped by CSS so the icon matches the theme the inline script applied before hydration. -->
      <span class="dark:hidden"><Icon name="sun" /></span>
      <span class="hidden dark:inline"><Icon name="moon" /></span>
    </button>
  {/snippet}
  {#each OPTIONS as option (option.value)}
    <MenuItem
      role="menuitemradio"
      checked={theme()?.preference === option.value}
      onselect={() => theme()?.set(option.value)}
    >
      <Icon name={option.icon} size={16} />
      {option.label}
    </MenuItem>
  {/each}
</Menu>
