<script lang="ts">
  import { enhance } from "$app/forms";
  import DiskUsage from "$lib/admin/DiskUsage.svelte";
  import { FormSubmission } from "$lib/admin/form-submission.svelte";
  import SectionHeader from "$lib/admin/SectionHeader.svelte";
  import SettingsCard from "$lib/admin/SettingsCard.svelte";
  import UploadLimitSetting from "$lib/admin/UploadLimitSetting.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  let { data, form } = $props();

  const submission = new FormSubmission();
</script>

<SectionHeader
  title="Storage"
  description="Uploads, previews and the database live on the data disk. Keep an eye on its free space and set how large a single upload may be."
/>

<div class="grid gap-4">
  <SettingsCard
    icon="upload"
    title="Upload limit"
    description="The largest file anyone can upload. Uploads resume after a lost connection, so large files are safe to send."
  >
    <form
      method="POST"
      action="?/saveUploadLimit"
      class="grid gap-4"
      use:enhance={submission.handle()}
    >
      <UploadLimitSetting
        initialBytes={data.maxUploadBytes}
        freeBytes={data.usage.volume?.availableBytes ?? null}
        error={form?.problem ?? null}
      />
      <div class="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={submission.busy}>
          Save limit
        </Button>
        <span aria-live="polite" class="text-sm">
          {#if form?.saved}
            <span class="inline-flex items-center gap-1.5 text-success">
              <Icon name="check-circle" size={16} />
              Saved
            </span>
          {/if}
        </span>
      </div>
    </form>
  </SettingsCard>

  <SettingsCard
    icon="hard-drive"
    title="Data disk"
    description="Deleting a project removes its media and previews. Models are stored by each worker, on the model disk shown under Models."
  >
    <DiskUsage usage={data.usage} />
  </SettingsCard>
</div>
