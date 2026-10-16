<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { formatBytes } from "$lib/shared/format";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/project-limits";
  import {
    defaultModelKey,
    type AvailableTranscriptionModel,
    type DetectedWorkerHardware,
  } from "$lib/shared/transcription-models";

  type Props = {
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
  };

  let { models, hardware }: Props = $props();

  const uid = $props.id();
  let modelPicker = $state<HTMLElement>();
  let modelPickerOpen = $state(false);
  let pickedModelKey = $state<string>();
  let selectedModelKey = $derived(pickedModelKey ?? defaultModelKey(models));
  let recommendedModel = $derived(models.find((model) => model.recommended));
  let selectedModel = $derived(
    models.find((model) => model.key === selectedModelKey),
  );

  function formatModelMemory(
    bytes: number | null,
    kind: "ram" | "vram" | null,
  ): string {
    if (
      typeof bytes !== "number" ||
      !Number.isFinite(bytes) ||
      bytes <= 0 ||
      (kind !== "ram" && kind !== "vram")
    ) {
      return "Memory use unknown";
    }
    return `~${formatBytes(bytes)} ${kind.toUpperCase()}`;
  }

  function handleModelPickerToggle(event: ToggleEvent): void {
    modelPickerOpen = event.newState === "open";
  }

  function selectTranscriptionModel(modelKey: string): void {
    pickedModelKey = modelKey;
    modelPicker?.hidePopover();
  }
</script>

{#if models.length}
  <p>
    Choose the accuracy and resource profile for this source. The first run
    downloads its model into the private cache.
  </p>
  <form class="transcription-setup" method="POST" action="?/transcribe">
    <div class="model-picker-field">
      <!-- app.css styles this id until the Tailwind redesign. -->
      <span id="transcription-model-label">Model</span>
      <input type="hidden" name="model" value={selectedModelKey} />
      <button
        class="model-picker-trigger"
        type="button"
        popovertarget={`${uid}-options`}
        aria-haspopup="dialog"
        aria-expanded={modelPickerOpen}
        aria-controls={`${uid}-options`}
        aria-labelledby={`transcription-model-label ${uid}-selection`}
        aria-describedby={`${uid}-selection-fit ${uid}-selection-description`}
      >
        <span class="model-picker-selection">
          <span class="model-picker-primary">
            <strong id={`${uid}-selection`}>
              {selectedModel?.displayName ?? "Choose a model"}
            </strong>
            <span
              class="model-picker-fit"
              id={`${uid}-selection-fit`}
              data-fit={selectedModel?.fit ?? "unknown"}
            >
              <span class="model-fit-icon" aria-hidden="true">
                <Icon name="cpu" size={14} />
              </span>
              <span>
                {selectedModel?.recommended
                  ? "Recommended"
                  : (selectedModel?.fitLabel ?? "Not checked")}
              </span>
            </span>
          </span>
          <span
            class="model-picker-description"
            id={`${uid}-selection-description`}
          >
            {selectedModel?.description ?? "Description unavailable."}
          </span>
        </span>
        <Icon name="chevron-down" size={18} />
      </button>
      <ul class="model-picker-hardware-list" aria-label="Detected hardware">
        {#each hardware as device (device)}
          <li class="model-picker-hardware-card">
            <span class="model-picker-hardware-icon">
              <Icon name="cpu" size={16} />
            </span>
            <span class="model-picker-hardware-copy">
              <span class="model-picker-hardware-eyebrow">
                Detected hardware
                <span>{device.kind}</span>
              </span>
              <strong class="model-picker-hardware-name">
                {device.name}
              </strong>
              <span class="model-picker-hardware-specs">
                {device.details.length
                  ? device.details.join(" · ")
                  : "Details unavailable"}
              </span>
            </span>
          </li>
        {:else}
          <li class="model-picker-hardware-card">
            <span class="model-picker-hardware-icon">
              <Icon name="cpu" size={16} />
            </span>
            <span class="model-picker-hardware-copy">
              <span class="model-picker-hardware-eyebrow">
                Detected hardware
              </span>
              <strong class="model-picker-hardware-name">
                Details unavailable
              </strong>
              <span class="model-picker-hardware-specs">
                CPU and GPU details were not reported.
              </span>
            </span>
          </li>
        {/each}
      </ul>
      <div
        class="model-picker-popover"
        id={`${uid}-options`}
        bind:this={modelPicker}
        popover
        role="dialog"
        aria-labelledby={`${uid}-dialog-title`}
        aria-describedby={`${uid}-dialog-subtitle`}
        ontoggle={handleModelPickerToggle}
      >
        <div class="model-picker-header">
          <strong id={`${uid}-dialog-title`}> Choose a model </strong>
          <span id={`${uid}-dialog-subtitle`}>
            {#if recommendedModel}
              {recommendedModel.displayName} is the best fit for your connected hardware.
            {:else}
              Small is the best starting point for most videos.
            {/if}
          </span>
        </div>
        <div
          class="model-picker-options"
          role="listbox"
          aria-labelledby={`${uid}-dialog-title`}
        >
          {#each models as model (model.key)}
            {@const downloadLabel =
              model.downloaded === true
                ? "Downloaded"
                : model.downloaded === false
                  ? "Needs download"
                  : "Download status unavailable"}
            <button
              class="model-option"
              type="button"
              role="option"
              aria-selected={model.key === selectedModelKey}
              data-fit={model.fit}
              onclick={() => selectTranscriptionModel(model.key)}
            >
              <span class="model-option-heading">
                <span class="model-option-identity">
                  <strong>{model.displayName}</strong>
                  <span class="model-option-meta">
                    <span
                      class="model-option-download"
                      data-download-state={model.downloaded === true
                        ? "downloaded"
                        : "not-downloaded"}
                      role="img"
                      aria-label={downloadLabel}
                      title={downloadLabel}
                    >
                      <Icon name="download" size={14} />
                    </span>
                    <span class="model-option-memory">
                      {formatModelMemory(
                        model.memoryRequirementBytes,
                        model.memoryRequirementKind,
                      )}
                    </span>
                  </span>
                </span>
                <span class="model-option-fit">
                  <span class="model-fit-icon" aria-hidden="true">
                    <Icon name="cpu" size={14} />
                  </span>
                  <span>
                    {model.recommended
                      ? "Recommended"
                      : model.fitLabel || "Not checked"}
                  </span>
                </span>
              </span>
              <span class="model-option-description">
                {model.description ?? "Description unavailable."}
              </span>
            </button>
          {/each}
        </div>
      </div>
    </div>
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
