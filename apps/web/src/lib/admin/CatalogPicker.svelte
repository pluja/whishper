<script lang="ts">
  import { enhance } from "$app/forms";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { pluralize } from "#lib/shared/format.ts";
  import type { CatalogModel } from "#lib/shared/providers.ts";

  type Props = {
    providerId: string;
    providerName: string;
    models: CatalogModel[];
    onclose: () => void;
    onproblem: (message: string) => void;
  };

  let { providerId, providerName, models, onclose, onproblem }: Props =
    $props();

  const submission = new FormSubmission();
  const speech = $derived(models.filter((model) => model.kind === "speech"));
  const others = $derived(models.filter((model) => model.kind !== "speech"));
  const newSpeech = $derived(speech.filter((model) => !model.added));
  // The card mounts a fresh picker for every new list, so the starting
  // selection only needs the list it was given.
  // svelte-ignore state_referenced_locally
  let chosen = $state<string[]>(newSpeech.map((model) => model.remoteId));
</script>

{#snippet choice(model: CatalogModel)}
  {@const unusable = model.kind === "text-only"}
  <li>
    <label
      class="flex items-start gap-2.5 rounded-md px-2 py-1.5 {model.added ||
      unusable
        ? 'cursor-default'
        : 'cursor-pointer hover:bg-surface-sunken'}"
    >
      <input
        class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        type="checkbox"
        name="remoteId"
        value={model.remoteId}
        bind:group={chosen}
        disabled={model.added || unusable}
      />
      <span class="grid min-w-0 gap-0.5">
        <span class="flex flex-wrap items-center gap-2">
          <code class="font-mono text-sm break-all text-text">
            {model.remoteId}
          </code>
          {#if model.added}<Badge tone="success">Added</Badge>{/if}
        </span>
        {#if unusable}
          <span class="text-xs text-text-muted">
            Answers with text only, without the timestamps subtitles need.
          </span>
        {/if}
      </span>
    </label>
  </li>
{/snippet}

<form
  method="POST"
  action="?/addModels"
  class="grid gap-3 rounded-md border border-border bg-surface-sunken/50 p-3"
  use:enhance={submission.handle({ onsuccess: onclose, onfailure: onproblem })}
>
  <input type="hidden" name="providerId" value={providerId} />
  <div class="flex items-start justify-between gap-3">
    <p class="text-sm text-text-muted">
      {providerName} lists {pluralize(models.length, "model")}.
      {newSpeech.length
        ? "Its new transcription models are ticked."
        : speech.length
          ? "Its transcription models are already added."
          : "None looks like a transcription model, so check the list below."}
      Nothing is added until you select Add.
    </p>
    <Button size="xs" variant="ghost" onclick={onclose}>Close</Button>
  </div>

  {#if speech.length}
    <ul class="grid gap-0.5" aria-label="Transcription models">
      {#each speech as model (model.remoteId)}
        {@render choice(model)}
      {/each}
    </ul>
  {/if}
  {#if others.length}
    <details class="group" open={speech.length === 0}>
      <summary
        class="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
      >
        <span
          class="grid transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        >
          <Icon name="chevron-right" size={16} />
        </span>
        {pluralize(others.length, "other model")}
      </summary>
      <ul
        class="mt-1 grid max-h-64 gap-0.5 overflow-y-auto"
        aria-label="Other models"
      >
        {#each others as model (model.remoteId)}
          {@render choice(model)}
        {/each}
      </ul>
    </details>
  {/if}

  <div class="flex justify-end">
    <Button
      type="submit"
      variant="primary"
      size="sm"
      loading={submission.busy}
      disabled={chosen.length === 0}
    >
      <Icon name="plus" size={16} />
      {chosen.length ? `Add ${pluralize(chosen.length, "model")}` : "Add"}
    </Button>
  </div>
</form>
