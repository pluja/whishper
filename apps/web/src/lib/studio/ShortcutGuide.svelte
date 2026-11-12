<script lang="ts">
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import Kbd from "#lib/components/ui/Kbd.svelte";
  import { shortcutGroups } from "#lib/editor/shortcuts.ts";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog
  bind:open
  size="lg"
  title="Keyboard shortcuts"
  description="Edit and navigate the studio without leaving the keyboard."
>
  <div class="grid gap-x-8 gap-y-6 md:grid-cols-2">
    {#each shortcutGroups as group (group.title)}
      <section class="min-w-0">
        <h3
          class="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase"
        >
          {group.title}
        </h3>
        <dl class="grid divide-y divide-border">
          {#each group.shortcuts as shortcut (shortcut.id)}
            <div
              class="grid grid-cols-[9.5rem_minmax(0,1fr)] items-baseline gap-3 py-1.5"
            >
              <dt class="flex flex-wrap items-center gap-1">
                {#each shortcut.keys as key, index (key)}
                  {#if index > 0}
                    <span class="text-xs text-text-subtle" aria-hidden="true"
                      >+</span
                    >
                  {/if}
                  <Kbd>{key}</Kbd>
                {/each}
              </dt>
              <dd class="text-sm text-text">{shortcut.description}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
  <p class="mt-6 text-xs text-text-muted">
    Shortcuts pause while typing. Space preserves focused button, link, and
    summary activation. Press <Kbd>?</Kbd> to reopen this guide.
  </p>
</Dialog>
