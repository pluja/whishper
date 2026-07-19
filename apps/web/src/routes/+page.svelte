<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import { Upload } from "tus-js-client";

  let { data, form } = $props();
  let selectedFile = $state<File | null>(null);
  let activeUpload = $state<Upload | null>(null);
  let uploadProgress = $state(0);
  let uploadState = $state<"idle" | "uploading" | "error" | "success">("idle");
  let uploadMessage = $state("");

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
  }) {
    if (project.job_state || project.run_status) {
      return project.job_state ?? project.run_status;
    }
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
    if (project.upload_status === "finalizing") return "Finalizing source media";
    if (project.upload_status === "completed") return "Source media stored";
    return "Project ready";
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

<section class="page-heading">
  <h1>{data.workspace?.name ?? "Projects"}</h1>
  <p>
    Each project keeps one source media item, its transcription runs, and
    editable tracks.
  </p>
</section>

{#if data.workspace}
  <form class="upload-panel" onsubmit={startUpload}>
    <div class="upload-copy">
      <h2>Import source media</h2>
      <p>
        Uploads resume after interruptions. Anysub stores the finished source in
        its application-managed project directory.
      </p>
    </div>
    <label class="file-picker">
      <span>Audio or video file</span>
      <input
        type="file"
        accept="audio/*,video/*"
        disabled={uploadState === "uploading"}
        data-state={uploadState}
        aria-invalid={uploadState === "error"}
        onchange={chooseFile}
      />
    </label>
    {#if selectedFile}
      <p class="selected-file">
        <span>{selectedFile.name}</span>
        <span>{formatBytes(selectedFile.size)}</span>
      </p>
    {/if}
    {#if uploadState !== "idle" || uploadMessage}
      <div class="job-progress" aria-live="polite">
        <progress value={uploadProgress} max="1">
          {Math.round(uploadProgress * 100)}%
        </progress>
        <p class:error={uploadState === "error"}>{uploadMessage}</p>
      </div>
    {/if}
    <div class="upload-actions">
      <button
        class="button"
        type="submit"
        data-state={uploadState === "uploading" ? "loading" : undefined}
        disabled={!selectedFile || uploadState === "uploading"}
      >
        {uploadState === "uploading" ? "Uploading" : "Create project"}
      </button>
      {#if uploadState === "uploading"}
        <button
          class="button secondary"
          type="button"
          onclick={cancelActiveUpload}>Cancel</button
        >
      {/if}
    </div>
  </form>
{/if}

{#if form?.message}
  <p class="helper error" role="alert">{form.message}</p>
{/if}

{#if data.projects.length === 0}
  <section class="empty-state">
    <div class="empty-mark" aria-hidden="true"></div>
    <h2>No projects yet.</h2>
    <p>
      Start with a deterministic adapter run. It uses no media or model download
      and verifies the application-to-worker contract.
    </p>
    <form method="POST" action="?/createDemo">
      <button class="button" type="submit">Run adapter demo</button>
    </form>
  </section>
{:else}
  <div class="projects-list">
    {#each data.projects as project}
      <a class="project-row" href={`/projects/${project.id}`}>
        <div>
          <h2>{project.name}</h2>
          <p>{projectMessage(project)}</p>
        </div>
        <span class="status" data-status={displayState(project)}>
          {displayState(project)}
        </span>
        <time datetime={project.created_at.toISOString()}>
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
            new Date(project.created_at),
          )}
        </time>
      </a>
    {/each}
  </div>

  <form
    method="POST"
    action="?/createDemo"
    style="margin-block-start: var(--space-xl)"
  >
    <button class="button secondary" type="submit">Run another demo</button>
  </form>
{/if}
