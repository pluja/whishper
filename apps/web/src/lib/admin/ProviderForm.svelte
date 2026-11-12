<script lang="ts">
  import { enhance } from "$app/forms";
  import FormMessage from "#lib/admin/FormMessage.svelte";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import {
    PROVIDER_NAME_MAX_LENGTH,
    PROVIDER_PRESETS,
    type AdminProvider,
  } from "#lib/shared/providers.ts";

  type Props = {
    // Absent when the form adds a new provider.
    provider?: AdminProvider;
    oncancel?: () => void;
    ondone?: () => void;
  };

  let { provider, oncancel, ondone }: Props = $props();

  const submission = new FormSubmission();
  // svelte-ignore state_referenced_locally
  let name = $state(provider?.name ?? "");
  // svelte-ignore state_referenced_locally
  let baseUrl = $state(provider?.baseUrl ?? "");
  let removeKey = $state(false);
  let problem = $state<string | null>(null);

  const keyHint = $derived(
    provider?.hasApiKey
      ? provider.apiKeyHint
        ? `Leave empty to keep the key ending in ${provider.apiKeyHint}.`
        : "Leave empty to keep the saved key."
      : "Needed by hosted services. Self-hosted servers often work without one.",
  );
</script>

<form
  method="POST"
  action={provider ? "?/updateProvider" : "?/createProvider"}
  class="grid gap-4"
  use:enhance={submission.handle({
    onsuccess: () => ondone?.(),
    onfailure: (message) => (problem = message),
  })}
  onsubmit={() => (problem = null)}
>
  {#if provider}
    <input type="hidden" name="providerId" value={provider.id} />
  {:else}
    <div
      class="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Start from"
    >
      <span class="text-sm text-text-muted">Start from</span>
      {#each PROVIDER_PRESETS as preset (preset.name)}
        <Button
          size="sm"
          variant={baseUrl === preset.baseUrl ? "primary" : "secondary"}
          aria-pressed={baseUrl === preset.baseUrl}
          onclick={() => {
            name = preset.name;
            baseUrl = preset.baseUrl;
          }}
        >
          {preset.name}
        </Button>
      {/each}
      <Button
        size="sm"
        variant="ghost"
        onclick={() => {
          name = "";
          baseUrl = "";
        }}
      >
        Other
      </Button>
    </div>
  {/if}

  <div class="grid gap-4 sm:grid-cols-2">
    <Field label="Name" hint="Shown next to its models.">
      {#snippet control({ id, describedBy })}
        <Input
          {id}
          aria-describedby={describedBy}
          name="name"
          bind:value={name}
          maxlength={PROVIDER_NAME_MAX_LENGTH}
          required
        />
      {/snippet}
    </Field>
    <Field label="Base URL" hint="The address its API paths start from.">
      {#snippet control({ id, describedBy })}
        <Input
          {id}
          aria-describedby={describedBy}
          name="baseUrl"
          type="url"
          bind:value={baseUrl}
          placeholder="https://api.example.com/v1"
          required
        />
      {/snippet}
    </Field>
  </div>

  <Field label="API key" hint={keyHint}>
    {#snippet control({ id, describedBy })}
      <Input
        {id}
        aria-describedby={describedBy}
        name="apiKey"
        type="password"
        autocomplete="new-password"
        spellcheck={false}
        disabled={removeKey}
      />
    {/snippet}
  </Field>
  {#if provider?.hasApiKey}
    <label class="flex cursor-pointer items-center gap-2.5 text-sm text-text">
      <input
        class="size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        type="checkbox"
        name="removeApiKey"
        bind:checked={removeKey}
      />
      Remove the saved key
    </label>
  {/if}
  <label class="flex cursor-pointer items-start gap-2.5">
    <input
      class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      type="checkbox"
      name="noModelList"
    />
    <span class="grid gap-0.5">
      <span class="text-sm text-text">The server has no model list</span>
      <span class="text-xs text-text-muted">
        Saves without checking the address at /models. Add its models by ID
        afterwards.
      </span>
    </span>
  </label>

  {#if problem}
    <FormMessage form={{ message: problem }} />
  {/if}

  <div class="flex flex-wrap justify-end gap-2">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Cancel</Button>
    {/if}
    <Button type="submit" variant="primary" loading={submission.busy}>
      {provider ? "Save provider" : "Add provider"}
    </Button>
  </div>
</form>
