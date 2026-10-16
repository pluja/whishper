<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { modal } from "$lib/browser/modal";
  import { formatBytes } from "$lib/shared/format";
  import { PROJECT_TITLE_MAX_LENGTH } from "$lib/shared/limits";
  import { ProjectUpload } from "./upload.svelte";

  let {
    workspaceId,
    open = $bindable(false),
  }: { workspaceId: string; open?: boolean } = $props();

  const upload = new ProjectUpload();
  let selectedFile = $state<File | null>(null);
  let projectName = $state("");
  let projectNameEdited = $state(false);
  let fileInput = $state<HTMLInputElement>();
  let normalizedProjectName = $derived(projectName.trim());
  let canCreateProject = $derived(
    normalizedProjectName.length > 0 &&
      normalizedProjectName.length <= PROJECT_TITLE_MAX_LENGTH &&
      selectedFile !== null &&
      !upload.uploading,
  );

  function reset() {
    selectedFile = null;
    projectName = "";
    projectNameEdited = false;
    upload.reset();
    if (fileInput) fileInput.value = "";
  }

  function close() {
    if (!upload.uploading) open = false;
  }

  function handleCancel(event: Event) {
    if (upload.uploading) event.preventDefault();
  }

  function handleClick(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  function handleClose() {
    open = false;
    if (!upload.uploading) reset();
  }

  function suggestedProjectName(filename: string): string {
    const finalDot = filename.lastIndexOf(".");
    const extensionless = finalDot > 0 ? filename.slice(0, finalDot) : filename;
    return extensionless.trim().slice(0, PROJECT_TITLE_MAX_LENGTH);
  }

  function chooseFile(event: Event) {
    selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    if (selectedFile && !projectNameEdited) {
      projectName = suggestedProjectName(selectedFile.name);
    }
    upload.reset();
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || !normalizedProjectName) return;
    void upload.start(selectedFile, workspaceId, normalizedProjectName);
  }
</script>

<dialog
  class="create-project-dialog"
  {@attach modal(open)}
  aria-labelledby="create-project-title"
  aria-describedby="create-project-description"
  oncancel={handleCancel}
  onclose={handleClose}
  onclick={handleClick}
>
  <div class="create-project-shell">
    <header class="create-project-header">
      <div>
        <p class="dialog-context">New project</p>
        <h2 id="create-project-title">Create a media workspace</h2>
        <p id="create-project-description">
          Name the project and choose its source recording.
        </p>
      </div>
      <button
        class="dialog-close"
        type="button"
        aria-label="Close create project"
        title="Close"
        disabled={upload.uploading}
        onclick={close}
      >
        <Icon name="close" size={18} />
      </button>
    </header>

    <form class="create-project-form" onsubmit={submit}>
      <label class="project-name-field">
        <span>Project name</span>
        <input
          type="text"
          name="projectName"
          bind:value={projectName}
          oninput={() => (projectNameEdited = true)}
          required
          maxlength={PROJECT_TITLE_MAX_LENGTH}
          autocomplete="off"
          disabled={upload.uploading}
          placeholder="Untitled project"
        />
      </label>

      <div class="source-media-field">
        <span class="source-media-label">Source media</span>
        <label class="media-dropzone" data-state={upload.status}>
          <input
            bind:this={fileInput}
            type="file"
            accept="audio/*,video/*"
            disabled={upload.uploading}
            aria-invalid={upload.status === "error"}
            onchange={chooseFile}
          />
          <span class="dropzone-icon"><Icon name="file" size={24} /></span>
          <span class="dropzone-copy">
            <strong>
              {selectedFile?.name ?? "Choose an audio or video file"}
            </strong>
            <span>
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · ready to upload`
                : "Drop a file here or browse your device"}
            </span>
          </span>
          <span class="button secondary compact" aria-hidden="true">
            {selectedFile ? "Change" : "Browse"}
          </span>
        </label>
      </div>

      <p class="upload-assurance">
        Large uploads resume after interruptions. Your original stays in
        Anysub's application-managed project directory.
      </p>

      {#if upload.status !== "idle" || upload.message}
        <div class="job-progress" aria-live="polite">
          <div class="progress-meta">
            <span class:error={upload.status === "error"}>
              {upload.message}
            </span>
            <span>{Math.round(upload.progress * 100)}%</span>
          </div>
          <progress value={upload.progress} max="1">
            {Math.round(upload.progress * 100)}%
          </progress>
        </div>
      {/if}

      <footer class="create-project-actions">
        <button
          class="button secondary"
          type="button"
          onclick={upload.uploading ? () => void upload.cancel() : close}
        >
          {upload.uploading ? "Cancel upload" : "Cancel"}
        </button>
        <button
          class="button"
          type="submit"
          data-state={upload.uploading ? "loading" : undefined}
          disabled={!canCreateProject}
        >
          {upload.uploading ? "Uploading" : "Create project"}
        </button>
      </footer>
    </form>
  </div>
</dialog>
