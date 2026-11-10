<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { beforeNavigate, goto, invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Progress from "$lib/components/ui/Progress.svelte";
  import { buttonClasses } from "$lib/components/ui/variants";
  import { formatBytes, truncateText } from "$lib/shared/format";
  import { PROJECT_TITLE_MAX_LENGTH } from "$lib/shared/limits";
  import { projectPageUrl } from "$lib/shared/routes";
  import { selectedFileProblem } from "./upload-messages";
  import { ProjectUpload } from "./upload.svelte";

  type Props = {
    workspaceId: string;
    maxUploadBytes: number;
    open?: boolean;
    initialFile?: File | null;
  };

  let {
    workspaceId,
    maxUploadBytes,
    open = $bindable(false),
    initialFile = null,
  }: Props = $props();

  const id = $props.id();
  const formId = `${id}-form`;
  const fileStatusId = `${id}-file-status`;
  const LEAVE_WARNING =
    "Leave this page and stop the upload? Choose the same file again later to resume it.";
  const upload = new ProjectUpload({
    onUploaded: showProject,
    onCancelled: () => void invalidateAll(),
  });
  let selectedFile = $state<File | null>(null);
  let projectName = $state("");
  let projectNameEdited = $state(false);
  let fileInput = $state<HTMLInputElement>();
  let normalizedProjectName = $derived(projectName.trim());
  let fileProblem = $derived(
    selectedFile ? selectedFileProblem(selectedFile, maxUploadBytes) : null,
  );
  let canCreateProject = $derived(
    normalizedProjectName.length > 0 &&
      normalizedProjectName.length <= PROJECT_TITLE_MAX_LENGTH &&
      selectedFile !== null &&
      fileProblem === null &&
      !upload.busy,
  );
  let percent = $derived(Math.round(upload.progress * 100));
  let announcement = $derived(fileProblem ?? upload.message);

  // A "leave" navigation unloads the page; cancelling it makes the browser ask instead.
  beforeNavigate((navigation) => {
    if (!upload.uploading) return;
    if (navigation.type === "leave" || !confirm(LEAVE_WARNING)) {
      navigation.cancel();
    }
  });

  onDestroy(() => upload.dispose());

  function showProject(projectId: string | null) {
    if (projectId) {
      void goto(projectPageUrl(projectId));
      return;
    }
    open = false;
    void invalidateAll();
  }

  $effect(() => {
    if (!open || !initialFile) return;
    const file = initialFile;
    untrack(() => {
      if (upload.busy) return;
      if (fileInput) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
      }
      selectFile(file);
    });
  });

  function reset() {
    selectedFile = null;
    projectName = "";
    projectNameEdited = false;
    upload.reset();
    if (fileInput) fileInput.value = "";
  }

  function close() {
    if (!upload.busy) open = false;
  }

  function suggestedProjectName(filename: string): string {
    const finalDot = filename.lastIndexOf(".");
    const extensionless = finalDot > 0 ? filename.slice(0, finalDot) : filename;
    return truncateText(extensionless.trim(), PROJECT_TITLE_MAX_LENGTH);
  }

  function selectFile(file: File | null) {
    selectedFile = file;
    if (selectedFile && !projectNameEdited) {
      projectName = suggestedProjectName(selectedFile.name);
    }
    upload.reset();
  }

  function chooseFile(event: Event) {
    selectFile((event.currentTarget as HTMLInputElement).files?.[0] ?? null);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || !canCreateProject) return;
    void upload.start(selectedFile, workspaceId, normalizedProjectName);
  }
</script>

<Dialog
  bind:open
  title="New project"
  description="Name the project and choose its source recording."
  dismissible={!upload.busy}
  onclose={reset}
>
  <form id={formId} class="grid gap-4" onsubmit={submit}>
    <Field label="Project name">
      {#snippet control({ id: inputId, describedBy, invalid })}
        <Input
          id={inputId}
          type="text"
          name="projectName"
          bind:value={projectName}
          oninput={() => (projectNameEdited = true)}
          required
          maxlength={PROJECT_TITLE_MAX_LENGTH}
          autocomplete="off"
          disabled={upload.busy}
          placeholder="Untitled project"
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      {/snippet}
    </Field>

    <Field label="Source media">
      {#snippet control({ id: inputId })}
        <div
          class="relative flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-sunken px-3 py-3 transition-colors duration-150 hover:border-accent has-[input:disabled]:opacity-50 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus has-[input[aria-invalid=true]]:border-danger motion-reduce:transition-none"
        >
          <input
            bind:this={fileInput}
            id={inputId}
            type="file"
            accept="audio/*,video/*"
            disabled={upload.busy}
            aria-invalid={fileProblem !== null || upload.status === "error"}
            aria-describedby={fileStatusId}
            onchange={chooseFile}
            class="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            class="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-text-muted"
            aria-hidden="true"
          >
            <Icon name="file" size={18} />
          </span>
          <span id={fileStatusId} class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-text">
              {selectedFile?.name ?? "Choose an audio or video file"}
            </span>
            <span
              class={[
                "block text-xs",
                fileProblem ? "text-danger" : "text-text-muted",
              ]}
            >
              {fileProblem ??
                (selectedFile
                  ? `${formatBytes(selectedFile.size)} · ready to upload`
                  : "Drop a file here or browse your device")}
            </span>
          </span>
          <span
            class="{buttonClasses('secondary', 'sm')} max-sm:hidden"
            aria-hidden="true"
          >
            {selectedFile ? "Change" : "Browse"}
          </span>
        </div>
      {/snippet}
    </Field>

    <p class="text-xs text-text-muted">
      Large uploads resume after interruptions. Your original stays in Anysub's
      application-managed project directory.
    </p>

    {#if upload.status !== "idle" || upload.message}
      <div class="grid gap-1.5">
        <div class="flex items-center justify-between gap-3 text-xs">
          <span
            class={upload.status === "error"
              ? "text-danger"
              : "text-text-muted"}
          >
            {upload.uploading
              ? `${formatBytes(upload.bytesUploaded)} of ${formatBytes(upload.bytesTotal)}`
              : upload.message}
          </span>
          <span class="font-mono text-text-muted tabular-nums">{percent}%</span>
        </div>
        <Progress value={upload.progress} label="Upload progress" />
      </div>
    {/if}
  </form>

  <p class="sr-only" role="status">{announcement}</p>

  {#snippet actions()}
    <Button
      onclick={upload.uploading ? () => void upload.cancel() : close}
      loading={upload.status === "cancelling"}
      disabled={upload.status === "success"}
    >
      {upload.uploading || upload.status === "cancelling"
        ? "Cancel upload"
        : "Cancel"}
    </Button>
    <Button
      variant="primary"
      type="submit"
      form={formId}
      loading={upload.uploading}
      disabled={!canCreateProject}
    >
      {upload.uploading ? "Uploading" : "Create project"}
    </Button>
  {/snippet}
</Dialog>
