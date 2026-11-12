<script lang="ts">
  import { enhance } from "$app/forms";
  import DefaultModelPicker from "#lib/admin/DefaultModelPicker.svelte";
  import { FormSubmission } from "#lib/admin/form-submission.svelte.ts";
  import LineLengthSetting from "#lib/admin/LineLengthSetting.svelte";
  import PrecisionChoice from "#lib/admin/PrecisionChoice.svelte";
  import SectionHeader from "#lib/admin/SectionHeader.svelte";
  import SettingsCard from "#lib/admin/SettingsCard.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import LanguagePicker from "#lib/studio/LanguagePicker.svelte";
  import { DETECT_LANGUAGE } from "#lib/shared/languages.ts";

  let { data, form } = $props();

  const submission = new FormSubmission();
</script>

<SectionHeader
  title="Transcription"
  description="The starting point for every new transcription. People can still change the model, language and alignment each time they transcribe."
/>

<form
  method="POST"
  action="?/save"
  class="grid gap-4"
  use:enhance={submission.handle()}
>
  <SettingsCard
    icon="cube"
    title="Default model"
    description="Larger models are more accurate and slower. Automatic follows the hardware, so it picks a faster model on a processor and a larger one on a graphics card."
  >
    <DefaultModelPicker models={data.models} initial={data.defaults.model} />
  </SettingsCard>

  <SettingsCard
    icon="globe"
    title="Spoken language"
    description="Choose a language when most of your media uses it. Detection listens to the first 30 seconds, which can guess wrong on quiet or mixed intros."
  >
    <LanguagePicker
      label="Language"
      initial={data.defaults.language ?? DETECT_LANGUAGE}
    />
  </SettingsCard>

  <SettingsCard
    icon="words"
    title="Word timing"
    description="Alignment gives every word its own timestamp, so subtitles start and end exactly on the speech. It takes a little longer and fetches a small model for each language."
  >
    <label
      class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2.5"
    >
      <input
        class="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        name="alignment"
        type="checkbox"
        checked={data.defaults.alignment}
      />
      <span class="grid gap-0.5">
        <span class="text-sm font-medium text-text">
          Align every word by default
        </span>
        <span class="text-xs text-text-muted">
          Recommended for editing, highlights and karaoke captions.
        </span>
      </span>
    </label>
  </SettingsCard>

  <SettingsCard
    icon="fit-width"
    title="Subtitle length"
    description="Transcripts are split into subtitles at whole words, each no longer than this."
  >
    <LineLengthSetting initial={data.defaults.maxLineLength} />
    {#if form?.problem?.field === "maxLineLength"}
      <p class="text-sm text-danger" role="alert">{form.problem.message}</p>
    {/if}
  </SettingsCard>

  <SettingsCard
    icon="gauge"
    title="Precision"
    description="How finely the model's numbers are stored while it runs. Applies to every transcription, on every worker."
  >
    <PrecisionChoice initial={data.defaults.precision} devices={data.devices} />
  </SettingsCard>

  <div
    class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-surface/95"
  >
    <div aria-live="polite" class="mr-auto text-sm">
      {#if form?.problem}
        <span class="inline-flex items-center gap-1.5 text-danger">
          <Icon name="alert" size={16} />
          {form.problem.message}
        </span>
      {:else if form?.saved}
        <span class="inline-flex items-center gap-1.5 text-success">
          <Icon name="check-circle" size={16} />
          Saved. New transcriptions use these settings.
        </span>
      {/if}
    </div>
    <Button type="submit" variant="primary" loading={submission.busy}>
      Save changes
    </Button>
  </div>
</form>
