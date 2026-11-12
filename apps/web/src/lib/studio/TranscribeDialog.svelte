<script lang="ts">
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import type { TranscriptionDefaults } from "#lib/shared/instance-settings.ts";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "#lib/shared/transcription-models.ts";
  import TranscribePanel, { PROCESSING_NOTE } from "./TranscribePanel.svelte";

  type Props = {
    open?: boolean;
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    defaults: TranscriptionDefaults;
    onbeforesubmit: () => Promise<string | null>;
  };

  let {
    open = $bindable(false),
    models,
    hardware,
    defaults,
    onbeforesubmit,
  }: Props = $props();
</script>

<Dialog bind:open title="Re-transcribe" description={PROCESSING_NOTE}>
  <TranscribePanel {models} {hardware} {defaults} {onbeforesubmit} />
</Dialog>
