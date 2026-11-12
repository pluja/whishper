<script lang="ts">
  import Dialog from "#lib/components/ui/Dialog.svelte";
  import type { TranscriptionDefaults } from "#lib/shared/instance-settings.ts";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "#lib/shared/transcription-models.ts";
  import TranscribePanel, { processingNote } from "./TranscribePanel.svelte";

  type Props = {
    open?: boolean;
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    defaults: TranscriptionDefaults;
    mediaDurationUs: number | null;
    onbeforesubmit: () => Promise<string | null>;
  };

  let {
    open = $bindable(false),
    models,
    hardware,
    defaults,
    mediaDurationUs,
    onbeforesubmit,
  }: Props = $props();
</script>

<Dialog bind:open title="Re-transcribe" description={processingNote(models)}>
  <TranscribePanel
    {models}
    {hardware}
    {defaults}
    {mediaDurationUs}
    {onbeforesubmit}
  />
</Dialog>
