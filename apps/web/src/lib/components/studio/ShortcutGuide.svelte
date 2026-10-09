<script lang="ts">
  import { shortcutGroups } from "$lib/editor/shortcuts";

  let dialog = $state<HTMLDialogElement>();

  export function open(): void {
    if (dialog && !dialog.open) dialog.showModal();
  }

  export function isOpen(): boolean {
    return dialog?.open ?? false;
  }
</script>

<dialog
  class="shortcut-guide"
  bind:this={dialog}
  aria-labelledby="shortcut-guide-title"
>
  <div class="shortcut-guide-shell">
    <div class="shortcut-guide-header">
      <div>
        <span>Power user map</span>
        <h2 id="shortcut-guide-title">Keyboard shortcuts</h2>
      </div>
      <form method="dialog">
        <button
          class="shortcut-guide-close"
          type="submit"
          aria-label="Close keyboard shortcuts">Close</button
        >
      </form>
    </div>
    <p class="shortcut-guide-intro">
      Edit and navigate the studio without leaving the keyboard.
    </p>
    <div class="shortcut-groups">
      {#each shortcutGroups as group (group.title)}
        <section class="shortcut-group">
          <h3>{group.title}</h3>
          {#each group.shortcuts as shortcut (shortcut.id)}
            <div class="shortcut-row">
              <span class="shortcut-keys">
                {#each shortcut.keys as key, index (key)}
                  {#if index > 0}<span aria-hidden="true">+</span>{/if}
                  <kbd>{key}</kbd>
                {/each}
              </span>
              <span class="shortcut-description">{shortcut.description}</span>
            </div>
          {/each}
        </section>
      {/each}
    </div>
    <p class="shortcut-guide-note">
      Shortcuts pause while typing. Space preserves focused button, link, and
      summary activation. Press <kbd>?</kbd> to reopen this guide.
    </p>
  </div>
</dialog>
