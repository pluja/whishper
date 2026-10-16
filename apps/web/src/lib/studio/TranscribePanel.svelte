<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "$lib/shared/transcription-models";
  import ModelPicker from "./ModelPicker.svelte";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
  };

  let { models, hardware }: Props = $props();
</script>

{#if models.length}
  <p>
    Choose the accuracy and resource profile for this source. The first run
    downloads its model into the private cache.
  </p>
  <form class="transcription-setup" method="POST" action="?/transcribe">
    <ModelPicker {models} {hardware} />
    <label>
      <span>Spoken language</span>
      <select name="language">
        <option value="auto">Detect automatically</option>
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="it">Italian</option>
        <option value="pt">Portuguese</option>
        <option value="nl">Dutch</option>
        <option value="pl">Polish</option>
        <option value="uk">Ukrainian</option>
        <option value="el">Greek</option>
        <option value="ar">Arabic</option>
        <option value="hi">Hindi</option>
        <option value="ja">Japanese</option>
        <option value="ko">Korean</option>
        <option value="zh">Chinese</option>
      </select>
    </label>
    <label class="check-row">
      <input name="alignment" type="checkbox" checked />
      <span>
        <strong>Accurate word alignment</strong>
        <small>Recommended for editing, highlights, and karaoke.</small>
      </span>
    </label>
    <details class="transcription-advanced">
      <summary>Advanced options</summary>
      <label>
        <span>Maximum line length</span>
        <input
          name="maxLineLength"
          type="number"
          min="20"
          max="120"
          value={DEFAULT_MAX_LINE_LENGTH}
          required
        />
      </label>
      <small
        >{DEFAULT_MAX_LINE_LENGTH} characters is a readable subtitle default. Splits
        preserve whole words.</small
      >
      <label>
        <span>Batch size</span>
        <input
          name="batchSize"
          type="number"
          min="1"
          max="64"
          placeholder="Automatic"
        />
      </label>
      <small>Lower this only if the worker runs out of memory.</small>
    </details>
    <button class="button wide" type="submit">
      <Icon name="activity" size={16} />
      Start transcription
    </button>
    <span class="empty-help"
      >Processing stays on your connected worker. No media leaves Anysub.</span
    >
  </form>
{:else}
  <p>
    A transcription worker is not connected yet. Start or inspect the worker
    container, then this page will offer its models.
  </p>
  <button class="button wide" type="button" disabled>
    Waiting for a speech worker
  </button>
  <span class="empty-help">Model choices appear automatically.</span>
{/if}
