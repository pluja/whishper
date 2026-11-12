<script lang="ts">
  import ProviderCard from "#lib/admin/ProviderCard.svelte";
  import ProviderForm from "#lib/admin/ProviderForm.svelte";
  import SectionHeader from "#lib/admin/SectionHeader.svelte";
  import SettingsCard from "#lib/admin/SettingsCard.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { pluralize } from "#lib/shared/format.ts";

  let { data, form } = $props();

  let adding = $state(false);
  const showAddForm = $derived(adding || data.providers.length === 0);
  const added = $derived(form && "added" in form ? form.added : null);
</script>

<SectionHeader
  title="External providers"
  description="Transcribe with a speech service such as OpenAI or Groq, or with your own server that speaks the same API. Its models appear next to the local ones, and people choose between them each time they transcribe."
/>

{#if added}
  <p
    class="mb-4 flex items-start gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success"
    role="status"
  >
    <span class="mt-0.5 shrink-0"><Icon name="check-circle" size={16} /></span>
    <span>
      {#if !added.hasModelList}
        Added {added.name} without checking its model list. Add its models by their
        ID.
      {:else if added.addedModels > 0}
        Added {added.name} with {pluralize(
          added.addedModels,
          "transcription model",
        )}. Remove the ones you don't want, or set their prices.
      {:else}
        Added {added.name}, but none of its models looks like a transcription
        model. Use Find models to choose from its list.
      {/if}
    </span>
  </p>
{/if}

<p
  class="mb-4 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-text-muted"
>
  <span class="mt-0.5 shrink-0"><Icon name="globe" size={16} /></span>
  <span>
    A transcription with a provider's model sends that project's audio to the
    provider, which may keep it and charge for it under its own terms. Local
    models never send media anywhere.
  </span>
</p>

{#if !data.remoteWorkerConnected}
  <p
    class="mb-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
  >
    <span class="mt-0.5 shrink-0"><Icon name="alert" size={16} /></span>
    No connected worker can use external providers yet. A worker prepares the audio
    and calls the provider, so these models appear once one connects. Start the worker,
    or update it to this version of Anysub.
  </p>
{/if}

<div class="grid gap-4">
  {#each data.providers as provider (provider.id)}
    <ProviderCard {provider} />
  {/each}

  {#if showAddForm}
    <SettingsCard
      icon="plus"
      title="Add a provider"
      description="Any service that offers OpenAI's /audio/transcriptions API works. Pick a known one to fill in its address."
    >
      <ProviderForm
        oncancel={data.providers.length ? () => (adding = false) : undefined}
        ondone={() => (adding = false)}
      />
    </SettingsCard>
  {:else}
    <div>
      <Button onclick={() => (adding = true)}>
        <Icon name="plus" size={16} />
        Add a provider
      </Button>
    </div>
  {/if}
</div>
