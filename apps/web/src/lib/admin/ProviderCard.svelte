<script lang="ts">
  import { enhance } from "$app/forms";
  import CatalogPicker from "#lib/admin/CatalogPicker.svelte";
  import FormMessage from "#lib/admin/FormMessage.svelte";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import ProviderForm from "#lib/admin/ProviderForm.svelte";
  import ProviderModelRow from "#lib/admin/ProviderModelRow.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ProviderIcon from "#lib/components/provider-icons/ProviderIcon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import { isRecord } from "#lib/shared/is-record.ts";
  import {
    PROVIDER_NAME_MAX_LENGTH,
    type AdminProvider,
    type CatalogModel,
  } from "#lib/shared/providers.ts";

  type Props = { provider: AdminProvider };

  let { provider }: Props = $props();

  const finding = new FormSubmission();
  const adding = new FormSubmission();
  const deleting = new FormSubmission();
  let editing = $state(false);
  let addingById = $state(false);
  // Shown in the card, next to the form that failed, rather than at the top
  // of the page.
  let problem = $state<string | null>(null);
  const showProblem = (message: string) => (problem = message);
  // Kept here rather than read from the page's form result, so a failed add
  // leaves the list and its selection in place.
  let catalog = $state<CatalogModel[] | null>(null);

  function isCatalog(value: unknown): value is { models: CatalogModel[] } {
    return isRecord(value) && Array.isArray(value.models);
  }
</script>

<section
  class="grid gap-4 rounded-lg border border-border bg-surface"
  aria-labelledby="provider-{provider.id}"
>
  <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
    <span
      class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
      aria-hidden="true"
    >
      <ProviderIcon name={provider.name} brand={provider.brand} size={18} />
    </span>
    <div class="grid min-w-0 flex-1 gap-0.5">
      <h3 id="provider-{provider.id}" class="text-base font-semibold text-text">
        {provider.name}
      </h3>
      <p class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
        <span class="break-all">{provider.baseUrl}</span>
        <span class="inline-flex items-center gap-1">
          <Icon name="key" size={12} />
          {provider.hasApiKey
            ? provider.apiKeyHint
              ? `Key ending in ${provider.apiKeyHint}`
              : "Key saved"
            : "No key"}
        </span>
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <IconButton
        icon="edit"
        size="sm"
        label={`Edit ${provider.name}`}
        aria-expanded={editing}
        onclick={() => (editing = !editing)}
      />
      <form
        method="POST"
        action="?/deleteProvider"
        use:enhance={deleting.handle({
          confirm: `Delete ${provider.name} and its models? Queued transcriptions that use them will fail. Transcripts already made stay.`,
          onfailure: showProblem,
        })}
      >
        <input type="hidden" name="providerId" value={provider.id} />
        <IconButton
          type="submit"
          icon="trash"
          size="sm"
          label={`Delete ${provider.name}`}
          disabled={deleting.busy}
        />
      </form>
    </div>
  </header>

  {#if editing}
    <div class="mx-4 rounded-md bg-surface-sunken p-4 sm:mx-5">
      <ProviderForm
        {provider}
        oncancel={() => (editing = false)}
        ondone={() => (editing = false)}
      />
    </div>
  {/if}

  {#if provider.models.length}
    <ul
      class="divide-y divide-border border-y border-border"
      aria-label={`Models on ${provider.name}`}
    >
      {#each provider.models as model (model.id)}
        <ProviderModelRow
          {model}
          providerName={provider.name}
          onproblem={showProblem}
        />
      {/each}
    </ul>
  {:else}
    <p class="px-4 text-sm text-text-muted sm:px-5">
      No models yet. Find the ones {provider.name} offers, or add one by its ID.
    </p>
  {/if}

  <div class="grid gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
    {#if problem}
      <FormMessage form={{ message: problem }} />
    {/if}

    {#if catalog}
      <!-- A new list starts a fresh selection. -->
      {#key catalog}
        <CatalogPicker
          providerId={provider.id}
          providerName={provider.name}
          models={catalog}
          onclose={() => (catalog = null)}
          onproblem={showProblem}
        />
      {/key}
    {/if}

    {#if addingById}
      <form
        method="POST"
        action="?/addModels"
        class="grid gap-3 rounded-md bg-surface-sunken p-3 sm:grid-cols-2 sm:items-end"
        use:enhance={adding.handle({
          onsuccess: () => (addingById = false),
          onfailure: showProblem,
        })}
      >
        <input type="hidden" name="providerId" value={provider.id} />
        <Field
          label="Model ID"
          hint="Exactly as the provider's documentation spells it."
        >
          {#snippet control({ id, describedBy })}
            <Input
              {id}
              aria-describedby={describedBy}
              name="remoteId"
              placeholder="whisper-1"
              spellcheck={false}
              required
            />
          {/snippet}
        </Field>
        <Field label="Name" hint="Optional. The ID is used if empty.">
          {#snippet control({ id, describedBy })}
            <Input
              {id}
              aria-describedby={describedBy}
              name="displayName"
              maxlength={PROVIDER_NAME_MAX_LENGTH}
            />
          {/snippet}
        </Field>
        <div class="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onclick={() => (addingById = false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={adding.busy}>
            Add model
          </Button>
        </div>
      </form>
    {/if}

    <div class="flex flex-wrap gap-2">
      <form
        method="POST"
        action="?/findModels"
        onsubmit={() => (problem = null)}
        use:enhance={finding.handle({
          onsuccess: (data) => {
            catalog = isCatalog(data?.catalog) ? data.catalog.models : null;
          },
          onfailure: showProblem,
        })}
      >
        <input type="hidden" name="providerId" value={provider.id} />
        <Button type="submit" size="sm" loading={finding.busy}>
          <Icon name="search" size={16} />
          Find models
        </Button>
      </form>
      {#if !addingById}
        <Button size="sm" variant="ghost" onclick={() => (addingById = true)}>
          <Icon name="plus" size={16} />
          Add by ID
        </Button>
      {/if}
    </div>
  </div>
</section>
