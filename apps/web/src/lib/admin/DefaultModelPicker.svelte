<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ProviderIcon from "#lib/components/provider-icons/ProviderIcon.svelte";
  import { FIT_TONES } from "#lib/components/model-fit.ts";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Picker from "#lib/components/ui/Picker.svelte";
  import { AUTOMATIC_MODEL } from "#lib/shared/instance-settings.ts";
  import {
    defaultModelKey,
    parseModelKey,
    type AvailableTranscriptionModel,
  } from "#lib/shared/transcription-models.ts";

  type Choice = {
    key: string;
    name: string;
    description: string;
    model: AvailableTranscriptionModel | null;
  };

  type Props = {
    models: AvailableTranscriptionModel[];
    initial: string | null;
  };

  let { models, initial }: Props = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(initial ?? AUTOMATIC_MODEL);

  const automaticPick = $derived(
    models.find((model) => model.key === defaultModelKey(models)),
  );
  const choices = $derived<Choice[]>([
    {
      key: AUTOMATIC_MODEL,
      name: "Automatic",
      description: automaticPick
        ? `Uses ${automaticPick.displayName}, the best fit for the connected hardware right now.`
        : "Uses the best fit for the hardware that is connected.",
      model: null,
    },
    ...models.map((model) => ({
      key: model.key,
      name: model.displayName,
      description: model.description ?? "",
      model,
    })),
    ...(initial && !models.some((model) => model.key === initial)
      ? [
          {
            key: initial,
            name: parseModelKey(initial)?.modelId ?? initial,
            description: "No connected worker offers this model right now.",
            model: null,
          },
        ]
      : []),
  ]);
  const selected = $derived(choices.find((choice) => choice.key === value));
  const needsDownload = $derived(selected?.model?.downloaded === false);
</script>

{#snippet choiceLabel(choice: Choice | undefined)}
  <span class="grid gap-1">
    <span class="flex min-w-0 items-center gap-2">
      <span class="shrink-0 text-text-muted">
        {#if choice?.model?.remote}
          <ProviderIcon
            name={choice.model.remote.providerName}
            brand={choice.model.remote.brand}
          />
        {:else}
          <Icon
            name={choice?.key === AUTOMATIC_MODEL ? "gauge" : "cube"}
            size={16}
          />
        {/if}
      </span>
      <strong class="min-w-0 flex-1 truncate text-sm font-semibold text-text">
        {choice?.name ?? "Choose a model"}
      </strong>
      {#if choice?.model}
        <span class="shrink-0">
          <Badge
            tone={choice.model.remote ? "neutral" : FIT_TONES[choice.model.fit]}
          >
            {choice.model.remote
              ? `External · ${choice.model.remote.providerName}`
              : choice.model.recommended
                ? "Recommended"
                : choice.model.fitLabel}
          </Badge>
        </span>
      {/if}
    </span>
    {#if choice?.description}
      <span class="text-xs break-words text-text-muted">
        {choice.description}
      </span>
    {/if}
  </span>
{/snippet}

<div class="grid gap-2">
  <Picker
    label="Model"
    name="model"
    options={choices}
    key={(choice) => choice.key}
    optionText={(choice) => choice.name}
    bind:value
    title="Choose the default model"
    subtitle="Each transcription can still pick another model."
    divided
  >
    {#snippet selection(choice)}
      {@render choiceLabel(choice)}
    {/snippet}
    {#snippet option(choice)}
      <span class="grid gap-1">
        {@render choiceLabel(choice)}
        {#if choice.model && !choice.model.remote}
          <span
            class="inline-flex items-center gap-1 text-xs {choice.model
              .downloaded
              ? 'text-success'
              : 'text-text-muted'}"
          >
            <Icon name="download" size={12} />
            {choice.model.downloaded ? "Downloaded" : "Not downloaded yet"}
          </span>
        {/if}
      </span>
    {/snippet}
  </Picker>
  {#if needsDownload}
    <p class="flex items-start gap-1.5 text-sm text-text-muted">
      <span class="mt-0.5 shrink-0 text-warning">
        <Icon name="clock" size={16} />
      </span>
      <span>
        Not downloaded yet, so the first transcription waits for the download.
        <a
          href="/admin/models"
          class="font-medium text-accent underline-offset-2 hover:underline"
          >Download it now</a
        >.
      </span>
    </p>
  {/if}
</div>
