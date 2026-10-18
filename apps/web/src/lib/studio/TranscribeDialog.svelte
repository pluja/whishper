<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import type {
    AvailableTranscriptionModel,
    DetectedWorkerHardware,
  } from "$lib/shared/transcription-models";
  import TranscribePanel from "./TranscribePanel.svelte";

  type Props = {
    open?: boolean;
    models: AvailableTranscriptionModel[];
    hardware: DetectedWorkerHardware[];
    onbeforesubmit: () => Promise<string | null>;
  };

  let {
    open = $bindable(false),
    models,
    hardware,
    onbeforesubmit,
  }: Props = $props();
</script>

<Dialog bind:open title="Re-transcribe">
  <TranscribePanel {models} {hardware} {onbeforesubmit} />
</Dialog>
