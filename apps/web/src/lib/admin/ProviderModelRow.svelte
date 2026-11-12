<script lang="ts">
  import { enhance } from "$app/forms";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Field from "#lib/components/ui/Field.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import { pluralize } from "#lib/shared/format.ts";
  import {
    formatPricePerMinute,
    formatUsd,
    microsToUsdInput,
  } from "#lib/shared/money.ts";
  import {
    PROVIDER_NAME_MAX_LENGTH,
    type AdminProviderModel,
  } from "#lib/shared/providers.ts";

  type Props = {
    model: AdminProviderModel;
    providerName: string;
    onproblem: (message: string) => void;
  };

  let { model, providerName, onproblem }: Props = $props();

  const save = new FormSubmission();
  const remove = new FormSubmission();
  let editing = $state(false);
</script>

<li class="grid gap-3 px-4 py-3 sm:px-5">
  <div class="flex items-start gap-3">
    <div class="grid min-w-0 flex-1 gap-0.5">
      <span class="text-sm font-semibold break-words text-text">
        {model.displayName}
      </span>
      <span class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
        <code class="font-mono break-all">{model.remoteId}</code>
        <span>
          {model.priceMicrosPerMinute === null
            ? "Price not set"
            : formatPricePerMinute(model.priceMicrosPerMinute)}
        </span>
        {#if model.completedRuns > 0}
          <span>
            {pluralize(
              model.completedRuns,
              "transcription",
            )}{model.estimatedSpendMicros > 0
              ? `, about ${formatUsd(model.estimatedSpendMicros)}`
              : ""}
          </span>
        {/if}
      </span>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <IconButton
        icon="edit"
        size="sm"
        label={`Edit ${model.displayName}`}
        aria-expanded={editing}
        onclick={() => (editing = !editing)}
      />
      <form
        method="POST"
        action="?/removeModel"
        use:enhance={remove.handle({
          confirm: `Remove ${model.displayName}? It stops appearing in the model list. Transcriptions already made with it stay.`,
          onfailure: onproblem,
        })}
      >
        <input type="hidden" name="modelId" value={model.id} />
        <IconButton
          type="submit"
          icon="trash"
          size="sm"
          label={`Remove ${model.displayName} from ${providerName}`}
          disabled={remove.busy}
        />
      </form>
    </div>
  </div>

  {#if editing}
    <form
      method="POST"
      action="?/updateModel"
      class="grid gap-3 rounded-md bg-surface-sunken p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end"
      use:enhance={save.handle({
        onsuccess: () => (editing = false),
        onfailure: onproblem,
      })}
    >
      <input type="hidden" name="modelId" value={model.id} />
      <Field label="Name">
        {#snippet control({ id, describedBy })}
          <Input
            {id}
            aria-describedby={describedBy}
            name="displayName"
            value={model.displayName}
            maxlength={PROVIDER_NAME_MAX_LENGTH}
            required
          />
        {/snippet}
      </Field>
      <Field label="USD per minute">
        {#snippet control({ id, describedBy })}
          <Input
            {id}
            aria-describedby={describedBy}
            name="price"
            inputmode="decimal"
            placeholder="0.006"
            value={microsToUsdInput(model.priceMicrosPerMinute)}
          />
        {/snippet}
      </Field>
      <div class="flex justify-end gap-2 sm:col-span-2">
        <Button variant="ghost" onclick={() => (editing = false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.busy}>
          <Icon name="check" size={16} />
          Save
        </Button>
      </div>
    </form>
  {/if}
</li>
