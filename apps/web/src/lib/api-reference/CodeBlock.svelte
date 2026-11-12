<script lang="ts">
  import { copyText } from "#lib/browser/clipboard.ts";
  import Icon from "#lib/components/Icon.svelte";

  type Props = { code: string; label: string };

  let { code, label }: Props = $props();

  let copyState = $state<"idle" | "copied" | "failed">("idle");
  const feedback = $derived(
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Copy failed, select the text instead"
        : null,
  );

  async function copy(): Promise<void> {
    copyState = (await copyText(code)) ? "copied" : "failed";
  }
</script>

<div class="relative">
  <pre
    class="rounded-md border border-border bg-surface-sunken py-3 pr-12 pl-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text"
    aria-label={label}><code>{code}</code></pre>
  <button
    type="button"
    class="absolute top-2 right-2 grid size-7 place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
    aria-label={feedback ?? `Copy ${label.toLowerCase()}`}
    title={feedback ?? "Copy"}
    onclick={copy}
    onblur={() => (copyState = "idle")}
  >
    <Icon name={copyState === "copied" ? "check" : "copy"} size={14} />
  </button>
</div>
