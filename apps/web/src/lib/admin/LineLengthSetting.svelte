<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import { pluralize } from "$lib/shared/format";
  import {
    MAX_LINE_LENGTH,
    MIN_LINE_LENGTH,
  } from "$lib/shared/instance-settings";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";
  import { splitIntoSubtitles } from "./subtitle-preview";

  const SAMPLE =
    "Good subtitles are short enough to read at a glance, so viewers can follow every word without missing what happens on screen.";
  const PREVIEWED_SUBTITLES = 4;

  type Props = { initial: number };

  let { initial }: Props = $props();

  const id = $props.id();
  // svelte-ignore state_referenced_locally
  let length = $state(initial);

  const subtitles = $derived(splitIntoSubtitles(SAMPLE, length));
</script>

<div class="grid gap-4">
  <div class="grid gap-2">
    <div class="flex items-center justify-between gap-3">
      <label for="{id}-range" class="text-sm font-medium text-text">
        Longest subtitle
      </label>
      <span class="flex items-center gap-2">
        {#if length !== DEFAULT_MAX_LINE_LENGTH}
          <Button
            variant="ghost"
            size="xs"
            onclick={() => (length = DEFAULT_MAX_LINE_LENGTH)}
          >
            Use {DEFAULT_MAX_LINE_LENGTH}
          </Button>
        {/if}
        <output
          for="{id}-range"
          class="text-sm font-semibold text-text tabular-nums"
        >
          {length} characters
        </output>
      </span>
    </div>
    <input
      id="{id}-range"
      name="maxLineLength"
      type="range"
      min={MIN_LINE_LENGTH}
      max={MAX_LINE_LENGTH}
      step="1"
      bind:value={length}
      aria-describedby="{id}-hint"
      aria-valuetext={`${length} characters`}
      class="w-full accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
    />
    <p id="{id}-hint" class="text-sm text-text-muted">
      {DEFAULT_MAX_LINE_LENGTH} is the most common standard for one subtitle line.
      Longer subtitles change less often but take longer to read.
    </p>
  </div>

  <figure class="grid gap-2">
    <div
      class="grid min-h-36 content-center justify-items-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-5"
      aria-hidden="true"
    >
      {#each subtitles.slice(0, PREVIEWED_SUBTITLES) as subtitle, index (index)}
        <span
          class="max-w-full rounded-sm bg-black/80 px-2 py-0.5 text-center text-xs break-words text-white sm:text-sm {index ===
          0
            ? ''
            : 'opacity-50'}"
        >
          {subtitle}
        </span>
      {/each}
      {#if subtitles.length > PREVIEWED_SUBTITLES}
        <span class="text-xs text-neutral-400">
          +{subtitles.length - PREVIEWED_SUBTITLES} more
        </span>
      {/if}
    </div>
    <figcaption class="text-xs text-text-muted">
      This example sentence becomes {pluralize(subtitles.length, "subtitle")},
      shown one after another.
    </figcaption>
  </figure>
</div>
