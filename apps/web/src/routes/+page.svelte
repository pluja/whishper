<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import { onMount } from "svelte";
  import { Upload } from "tus-js-client";

  let { data, form } = $props();
  let selectedFile = $state<File | null>(null);
  let activeUpload = $state<Upload | null>(null);
  let uploadProgress = $state(0);
  let uploadState = $state<"idle" | "uploading" | "error" | "success">("idle");
  let uploadMessage = $state("");
  // svelte-ignore state_referenced_locally
  let importOpen = $state(data.projects.length === 0);

  onMount(() => {
    const hasActiveJob = data.projects.some(
      (project: { job_state: string | null; upload_status: string | null }) =>
        project.job_state === "queued" ||
        project.job_state === "leased" ||
        project.upload_status === "uploading" ||
        project.upload_status === "finalizing",
    );
    if (!hasActiveJob) return;
    const interval = window.setInterval(() => void invalidateAll(), 2_000);
    return () => window.clearInterval(interval);
  });

  function displayState(project: {
    run_status: string | null;
    job_state: string | null;
    upload_status: string | null;
  }): string {
    const processingState = project.job_state ?? project.run_status;
    if (processingState) return processingState;
    return project.upload_status === "completed"
      ? "ready"
      : (project.upload_status ?? "draft");
  }

  function projectMessage(project: {
    progress_message: string | null;
    upload_status: string | null;
    received_bytes: number | null;
    size_bytes: number | null;
  }): string {
    if (project.progress_message) return project.progress_message;
    if (
      project.upload_status === "uploading" &&
      project.received_bytes !== null &&
      project.size_bytes
    ) {
      const progress = Math.round(
        (project.received_bytes / project.size_bytes) * 100,
      );
      return `Uploading · ${progress}%`;
    }
    if (project.upload_status === "finalizing")
      return "Finalizing source media";
    if (project.upload_status === "completed") return "Source media stored";
    return "Project ready";
  }

  function stateLabel(state: string): string {
    const labels: Record<string, string> = {
      ready: "Ready",
      draft: "Draft",
      queued: "Queued",
      leased: "Processing",
      running: "Processing",
      completed: "Complete",
      failed: "Needs attention",
      uploading: "Uploading",
      finalizing: "Finalizing",
    };
    return labels[state] ?? state;
  }

  function chooseFile(event: Event) {
    selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    uploadState = "idle";
    uploadProgress = 0;
    uploadMessage = "";
  }

  async function startUpload(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedFile || !data.workspace || uploadState === "uploading") return;

    uploadState = "uploading";
    uploadMessage = "Preparing resumable upload";
    const upload = new Upload(selectedFile, {
      endpoint: "/api/uploads",
      chunkSize: 32 * 1024 * 1024,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000, 20_000],
      removeFingerprintOnSuccess: true,
      metadata: {
        filename: selectedFile.name,
        filetype: selectedFile.type,
        workspaceId: data.workspace.id,
      },
      onProgress(bytesUploaded, bytesTotal) {
        uploadProgress = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0;
        uploadMessage = `${formatBytes(bytesUploaded)} of ${formatBytes(bytesTotal)}`;
      },
      onError(error) {
        uploadState = "error";
        uploadMessage = error.message || "The upload could not be completed.";
      },
      onSuccess({ lastResponse }) {
        uploadState = "success";
        uploadProgress = 1;
        uploadMessage = "Upload complete";
        const projectId = lastResponse.getHeader("Upload-Project");
        if (projectId) void goto(`/projects/${projectId}`);
        else void invalidateAll();
      },
    });
    activeUpload = upload;
    try {
      const previous = await upload.findPreviousUploads();
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    } catch (error) {
      uploadState = "error";
      uploadMessage =
        error instanceof Error ? error.message : "Could not start the upload.";
    }
  }

  async function cancelActiveUpload() {
    if (!activeUpload) return;
    try {
      await activeUpload.abort(true);
      activeUpload = null;
      uploadState = "idle";
      uploadProgress = 0;
      uploadMessage = "Upload cancelled";
      await invalidateAll();
    } catch (error) {
      uploadState = "error";
      uploadMessage =
        error instanceof Error ? error.message : "Could not cancel the upload.";
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes;
    let unit = -1;
    do {
      value /= 1024;
      unit += 1;
    } while (value >= 1024 && unit < units.length - 1);
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  }
</script>

<svelte:head>
  <title>Projects · Anysub</title>
</svelte:head>

<header class="page-bar">
  <div>
    <p class="eyebrow">{data.workspace?.name ?? "Workspace"}</p>
    <h1>Projects</h1>
    <p class="page-description">
      Import media, run transcription, and refine every subtitle track.
    </p>
  </div>
  {#if data.workspace}
    <button
      class="button"
      type="button"
      aria-expanded={importOpen}
      aria-controls="import-panel"
      onclick={() => (importOpen = !importOpen)}
    >
      <Icon name={importOpen ? "chevron-down" : "plus"} size={17} />
      {importOpen ? "Close import" : "New project"}
    </button>
  {/if}
</header>

<div class="workspace-summary" aria-label="Workspace summary">
  <div>
    <strong>{data.projects.length}</strong>
    <span>{data.projects.length === 1 ? "project" : "projects"}</span>
  </div>
  <div>
    <strong>
      {data.projects.filter(
        (project: { upload_status: string | null }) =>
          project.upload_status === "completed",
      ).length}
    </strong>
    <span>sources ready</span>
  </div>
  <div class="summary-privacy">
    <Icon name="lock" size={15} />
    <span>Stored on this installation</span>
  </div>
</div>

{#if data.workspace && importOpen}
  <section class="import-card" id="import-panel">
    <div class="section-heading">
      <div class="section-icon"><Icon name="upload" size={20} /></div>
      <div>
        <h2>Import source media</h2>
        <p>Large uploads resume automatically after an interruption.</p>
      </div>
    </div>

    <form onsubmit={startUpload}>
      <label class="media-dropzone" data-state={uploadState}>
        <input
          type="file"
          accept="audio/*,video/*"
          disabled={uploadState === "uploading"}
          aria-invalid={uploadState === "error"}
          onchange={chooseFile}
        />
        <span class="dropzone-icon"><Icon name="file" size={24} /></span>
        <span class="dropzone-copy">
          <strong
            >{selectedFile?.name ?? "Choose an audio or video file"}</strong
          >
          <span>
            {selectedFile
              ? `${formatBytes(selectedFile.size)} · ready to import`
              : "MP3, WAV, M4A, MP4, MKV, and other browser-supported media"}
          </span>
        </span>
        <span class="button secondary compact" aria-hidden="true">
          {selectedFile ? "Change" : "Browse"}
        </span>
      </label>

      {#if uploadState !== "idle" || uploadMessage}
        <div class="job-progress" aria-live="polite">
          <div class="progress-meta">
            <span class:error={uploadState === "error"}>{uploadMessage}</span>
            <span>{Math.round(uploadProgress * 100)}%</span>
          </div>
          <progress value={uploadProgress} max="1">
            {Math.round(uploadProgress * 100)}%
          </progress>
        </div>
      {/if}

      <div class="import-actions">
        <p>
          The original is stored in Anysub's application-managed project
          directory.
        </p>
        <div>
          {#if uploadState === "uploading"}
            <button
              class="button secondary"
              type="button"
              onclick={cancelActiveUpload}>Cancel</button
            >
          {/if}
          <button
            class="button"
            type="submit"
            data-state={uploadState === "uploading" ? "loading" : undefined}
            disabled={!selectedFile || uploadState === "uploading"}
          >
            {uploadState === "uploading" ? "Uploading" : "Create project"}
          </button>
        </div>
      </div>
    </form>
  </section>
{/if}

{#if form?.message}
  <p class="helper error" role="alert">{form.message}</p>
{/if}

{#if data.projects.length === 0}
  <section class="projects-empty">
    <div class="empty-illustration" aria-hidden="true">
      <Icon name="subtitles" size={30} />
    </div>
    <h2>Your project library is empty</h2>
    <p>
      Import a recording, interview, lecture, or film to create its private
      subtitle workspace.
    </p>
  </section>
{:else}
  <section class="projects-section" aria-labelledby="project-list-title">
    <div class="section-title-row">
      <div>
        <h2 id="project-list-title">Recent projects</h2>
        <p>Open a project to review its source and subtitle tracks.</p>
      </div>
    </div>
    <div class="project-columns" aria-hidden="true">
      <span>Project</span>
      <span>Status</span>
      <span>Size</span>
      <span>Created</span>
    </div>
    <div class="projects-list">
      {#each data.projects as project}
        <a class="project-row" href={`/projects/${project.id}`}>
          <div class="project-identity">
            <span class="project-file-icon"><Icon name="file" size={19} /></span
            >
            <div>
              <h3>{project.name}</h3>
              <p>{project.original_filename ?? projectMessage(project)}</p>
            </div>
          </div>
          <span class="status" data-status={displayState(project)}>
            {stateLabel(displayState(project))}
          </span>
          <span class="project-size">
            {project.size_bytes ? formatBytes(project.size_bytes) : "—"}
          </span>
          <time
            class="project-date"
            datetime={project.created_at.toISOString()}
          >
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(project.created_at))}
          </time>
        </a>
      {/each}
    </div>
  </section>
{/if}

<details class="diagnostics">
  <summary>
    <span><Icon name="activity" size={17} /> Worker diagnostics</span>
    <Icon name="chevron-down" size={16} />
  </summary>
  <div class="diagnostics-body">
    <div>
      <strong>Test the processing pipeline</strong>
      <p>
        Creates a deterministic subtitle track without using source media or
        downloading a speech model.
      </p>
    </div>
    <form method="POST" action="?/createDemo">
      <button class="button secondary" type="submit">Run worker test</button>
    </form>
  </div>
</details>
