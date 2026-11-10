<script lang="ts">
  import Flag from "$lib/components/Flag.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Picker from "$lib/components/ui/Picker.svelte";
  import {
    DETECT_LANGUAGE,
    LANGUAGES,
    matchesLanguage,
    type Language,
  } from "$lib/shared/languages";

  const DETECT_AUTOMATICALLY: Language = {
    code: DETECT_LANGUAGE,
    name: "Detect automatically",
    nativeName: "",
    flag: null,
    common: true,
  };
  const OPTIONS = [DETECT_AUTOMATICALLY, ...LANGUAGES];

  let {
    initial = DETECT_LANGUAGE,
    label = "Spoken language",
  }: { initial?: string; label?: string } = $props();

  // Seeded once: later changes to the default must not discard a choice.
  // svelte-ignore state_referenced_locally
  let value = $state(initial);

  function matchesSearchedLanguage(language: Language, query: string): boolean {
    return (
      language !== DETECT_AUTOMATICALLY && matchesLanguage(language, query)
    );
  }

  function groupOf(language: Language): string {
    if (language.code === DETECT_LANGUAGE) return "";
    return language.common ? "Common" : "Other languages";
  }
</script>

{#snippet languageLabel(language: Language)}
  <span class="flex min-w-0 items-center gap-2.5">
    {#if language.code === DETECT_LANGUAGE}
      <span class="grid h-4.5 w-6 shrink-0 place-items-center text-text-muted">
        <Icon name="globe" size={18} />
      </span>
    {:else}
      <Flag flag={language.flag} placeholder={language.code} />
    {/if}
    <span class="min-w-0 truncate text-sm text-text">{language.name}</span>
    {#if language.nativeName && language.nativeName !== language.name}
      <span class="min-w-0 truncate text-xs text-text-muted" dir="auto">
        {language.nativeName}
      </span>
    {/if}
  </span>
{/snippet}

<Picker
  {label}
  name="language"
  options={OPTIONS}
  key={(language) => language.code}
  bind:value
  title="Choose the spoken language"
  searchLabel="Search languages"
  matches={matchesSearchedLanguage}
  group={groupOf}
>
  {#snippet selection(language)}
    {#if language}{@render languageLabel(language)}{/if}
  {/snippet}
  {#snippet option(language)}
    {@render languageLabel(language)}
  {/snippet}
</Picker>
