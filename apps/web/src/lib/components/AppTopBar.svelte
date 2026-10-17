<script lang="ts">
  import Icon from "./Icon.svelte";
  import ThemeMenu from "./ThemeMenu.svelte";
  import Menu from "./ui/Menu.svelte";
  import MenuItem from "./ui/MenuItem.svelte";
  import { buttonClasses } from "./ui/variants";

  type Props = { email: string };

  let { email }: Props = $props();

  let signOutForm: HTMLFormElement;
</script>

<header class="h-14 border-b border-border bg-surface">
  <div
    class="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
  >
    <a
      href="/"
      class="-mx-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-base font-semibold tracking-tight text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span class="text-accent"><Icon name="subtitles" size={20} /></span>
      Anysub
    </a>

    <div class="flex items-center gap-1">
      <ThemeMenu />
      <Menu label="Account" align="end">
        {#snippet trigger(args)}
          <button
            type="button"
            {...args}
            class={buttonClasses("ghost", "md", true)}
            aria-label="Account"
            title="Account"
          >
            <span
              class="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
              aria-hidden="true"
            >
              {email.slice(0, 1).toUpperCase()}
            </span>
          </button>
        {/snippet}
        <p class="max-w-64 truncate px-2.5 pt-1.5 pb-2 text-xs text-text-muted">
          {email}
        </p>
        <div role="separator" class="-mx-1 mb-1 border-t border-border"></div>
        <MenuItem onselect={() => signOutForm.requestSubmit()}>
          <Icon name="logout" size={16} />
          Sign out
        </MenuItem>
      </Menu>
    </div>
  </div>
</header>

<form bind:this={signOutForm} method="POST" action="/?/signOut" hidden></form>
