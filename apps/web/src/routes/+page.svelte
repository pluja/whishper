<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { onMount } from "svelte";
  import { Upload } from "tus-js-client";

  let { data, form } = $props();
  let selectedFile = $state<File | null>(null);
  let activeUpload = $state<Upload | null>(null);
  let uploadProgress = $state(0);
  let uploadState = $state<"idle" | "uploading" | "error" | "success">("idle");
  let uploadMessage = $state("");
  let projectName = $state("");
  let projectNameEdited = $state(false);
  let createDialog: HTMLDialogElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let normalizedProjectName = $derived(projectName.trim());
  let canCreateProject = $derived(
    normalizedProjectName.length > 0 &&
      normalizedProjectName.length <= 160 &&
      selectedFile !== null &&
      uploadState !== "uploading",
  );
  let hasActiveSearch = $derived(
    data.search.query.length > 0 || data.search.includeSubtitles,
  );
  let firstThumbnailIndex = $derived(
    data.projects.findIndex(
      (project: { has_thumbnail: boolean }) => project.has_thumbnail,
    ),
  );
  // svelte-ignore state_referenced_locally
  let editingProjectId = $state<string | null>(form?.renameProjectId ?? null);
  // svelte-ignore state_referenced_locally
  let renameDraft = $state(
    data.projects.find(
      (project: { id: string }) => project.id === form?.renameProjectId,
    )?.name ?? "",
  );
  let renameSavingId = $state<string | null>(null);

  onMount(() => {
    const hasActiveJob = data.projects.some(
      (project: {
        job_state: string | null;
        upload_status: string | null;
        media_preparation_status: string;
      }) =>
        project.job_state === "queued" ||
        project.job_state === "leased" ||
        project.upload_status === "uploading" ||
        project.upload_status === "finalizing" ||
        project.media_preparation_status === "queued" ||
        project.media_preparation_status === "running",
    );
    if (!hasActiveJob) return;
    const interval = window.setInterval(() => void invalidateAll(), 2_000);
    return () => window.clearInterval(interval);
  });

  function displayState(project: {
    run_status: string | null;
    job_state: string | null;
    upload_status: string | null;
    media_preparation_status: string;
  }): string {
    const processingState = project.job_state ?? project.run_status;
    if (processingState) return processingState;
    if (
      project.media_preparation_status === "queued" ||
      project.media_preparation_status === "running"
    ) {
      return "preparing";
    }
    if (project.media_preparation_status === "failed") return "failed";
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
      preparing: "Preparing",
      completed: "Complete",
      failed: "Needs attention",
      uploading: "Uploading",
      finalizing: "Finalizing",
    };
    return labels[state] ?? state;
  }

  function projectSourceFallback(project: {
    progress_message: string | null;
    upload_status: string | null;
    received_bytes: number | null;
    size_bytes: number | null;
    media_type: string | null;
  }): string {
    const message = projectMessage(project);
    if (message !== "Project ready") return message;
    if (project.media_type?.startsWith("audio/")) return "Audio source";
    if (project.media_type?.startsWith("video/")) return "Video source";
    return "Media source";
  }

  function mediaPlaceholder(project: { media_type: string | null }): {
    icon: string;
    label: string;
  } {
    if (project.media_type?.startsWith("audio/")) {
      return { icon: "audio", label: "Audio project" };
    }
    if (project.media_type?.startsWith("video/")) {
      return { icon: "play", label: "Video project" };
    }
    return { icon: "file", label: "Media project" };
  }

  function beginRename(projectId: string, projectName: string) {
    renameDraft = projectName;
    editingProjectId = projectId;
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  function cancelRename() {
    editingProjectId = null;
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelRename();
  }

  function renameActionUrl(): string {
    const search = new URLSearchParams();
    if (data.search.query) search.set("q", data.search.query);
    if (data.search.includeSubtitles) search.set("scope", "subtitles");
    const query = search.toString();
    return query ? `?${query}&/renameProject` : "?/renameProject";
  }

  const enhanceRename: SubmitFunction = ({ formData }) => {
    const projectId = String(formData.get("projectId") ?? "");
    renameSavingId = projectId;
    return async ({ result, update }) => {
      renameSavingId = null;
      if (result.type === "failure") {
        editingProjectId = projectId;
      } else if (result.type === "success" || result.type === "redirect") {
        editingProjectId = null;
      }
      await update({ reset: false });
    };
  };

  function captureCreateDialog(element: HTMLDialogElement) {
    createDialog = element;
  }

  function captureFileInput(element: HTMLInputElement) {
    fileInput = element;
  }

  function resetCreateProject() {
    selectedFile = null;
    activeUpload = null;
    uploadProgress = 0;
    uploadState = "idle";
    uploadMessage = "";
    projectName = "";
    projectNameEdited = false;
    if (fileInput) fileInput.value = "";
  }

  function openCreateProject() {
    if (createDialog && !createDialog.open) createDialog.showModal();
  }

  function closeCreateProject() {
    if (uploadState !== "uploading") createDialog?.close();
  }

  function handleDialogCancel(event: Event) {
    if (uploadState === "uploading") event.preventDefault();
  }

  function handleDialogClick(event: MouseEvent) {
    if (event.target === createDialog && uploadState !== "uploading") {
      createDialog?.close();
    }
  }

  function handleDialogClose() {
    if (uploadState !== "uploading") resetCreateProject();
  }

  function editProjectName() {
    projectNameEdited = true;
  }

  function suggestedProjectName(filename: string): string {
    const finalDot = filename.lastIndexOf(".");
    const extensionless = finalDot > 0 ? filename.slice(0, finalDot) : filename;
    return extensionless.trim().slice(0, 160);
  }

  function chooseFile(event: Event) {
    selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    if (selectedFile && !projectNameEdited) {
      projectName = suggestedProjectName(selectedFile.name);
    }
    uploadState = "idle";
    uploadProgress = 0;
    uploadMessage = "";
  }

  async function startUpload(event: SubmitEvent) {
    event.preventDefault();
    if (
      !selectedFile ||
      !data.workspace ||
      !normalizedProjectName ||
      uploadState === "uploading"
    ) {
      return;
    }

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
        projectName: normalizedProjectName,
      },
      onProgress(bytesUploaded, bytesTotal) {
        uploadProgress = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0;
        uploadMessage = `${formatBytes(bytesUploaded)} of ${formatBytes(bytesTotal)}`;
      },
      onError(error) {
        activeUpload = null;
        uploadState = "error";
        uploadMessage = error.message || "The upload could not be completed.";
      },
      onSuccess({ lastResponse }) {
        activeUpload = null;
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
      activeUpload = null;
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

  function formatDuration(microseconds: number): string {
    const totalSeconds = Math.round(microseconds / 1_000_000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3_600);
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function formatDimensions(
    width: string | null,
    height: string | null,
  ): string | null {
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (
      !Number.isInteger(numericWidth) ||
      !Number.isInteger(numericHeight) ||
      numericWidth <= 0 ||
      numericHeight <= 0
    ) {
      return null;
    }
    return `${numericWidth}×${numericHeight}`;
  }

  const languageNames = new Intl.DisplayNames(undefined, { type: "language" });

  function formatLanguages(languages: string[]): string {
    return languages
      .map((language) => {
        try {
          return languageNames.of(language) ?? language;
        } catch {
          return language;
        }
      })
      .join(", ");
  }

  function formatSubtitleCounts(trackCount: number, cueCount: number): string {
    const tracks = `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`;
    const cues = `${cueCount} ${cueCount === 1 ? "cue" : "cues"}`;
    return `${tracks} · ${cues}`;
  }

  const activityDateTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function activityDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  function formatActivity(value: Date | string): string {
    return activityDateTime.format(activityDate(value));
  }
</script>

<svelte:head>
  <title>Projects · Anysub</title>
</svelte:head>

<div class="project-library-page">
  <header class="library-header">
    <div class="library-heading">
      <p class="library-context">{data.workspace?.name ?? "Workspace"}</p>
      <h1>Projects</h1>
      <p class="library-summary">
        {data.workspace?.project_count ?? 0}
        {(data.workspace?.project_count ?? 0) === 1 ? "project" : "projects"} ·
        {data.workspace?.ready_source_count ?? 0}
        {(data.workspace?.ready_source_count ?? 0) === 1
          ? "source ready"
          : "sources ready"}
      </p>
    </div>
  </header>

  <div class="library-toolbar">
    {#if data.workspace}
      <button
        class="button library-new-project"
        type="button"
        onclick={openCreateProject}
      >
        <Icon name="plus" size={17} />
        New project
      </button>
    {/if}

    <form class="project-search" method="GET" action="/" role="search">
      <label class="project-search-field">
        <span class="visually-hidden">Search projects</span>
        <span class="project-search-control">
          <Icon name="search" size={18} />
          <input
            type="search"
            name="q"
            autocomplete="off"
            value={data.search.query}
            placeholder="Search projects"
            maxlength="200"
          />
          {#if hasActiveSearch}
            <a class="search-clear" href="/" aria-label="Clear search">
              <Icon name="close" size={15} />
            </a>
          {/if}
        </span>
      </label>
      <label
        class="search-scope"
        data-selected={data.search.includeSubtitles ? "true" : undefined}
      >
        <input
          type="checkbox"
          name="scope"
          value="subtitles"
          checked={data.search.includeSubtitles}
        />
        <span>Subtitle text</span>
      </label>
      <button class="button secondary search-submit" type="submit">
        Search
      </button>
    </form>
  </div>

  {#if data.workspace}
    <dialog
      class="create-project-dialog"
      {@attach captureCreateDialog}
      aria-labelledby="create-project-title"
      aria-describedby="create-project-description"
      oncancel={handleDialogCancel}
      onclose={handleDialogClose}
      onclick={handleDialogClick}
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
            disabled={uploadState === "uploading"}
            onclick={closeCreateProject}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <form class="create-project-form" onsubmit={startUpload}>
          <label class="project-name-field">
            <span>Project name</span>
            <input
              type="text"
              name="projectName"
              bind:value={projectName}
              oninput={editProjectName}
              required
              maxlength="160"
              autocomplete="off"
              disabled={uploadState === "uploading"}
              placeholder="Untitled project"
            />
          </label>

          <div class="source-media-field">
            <span class="source-media-label">Source media</span>
            <label class="media-dropzone" data-state={uploadState}>
              <input
                {@attach captureFileInput}
                type="file"
                accept="audio/*,video/*"
                disabled={uploadState === "uploading"}
                aria-invalid={uploadState === "error"}
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

          {#if uploadState !== "idle" || uploadMessage}
            <div class="job-progress" aria-live="polite">
              <div class="progress-meta">
                <span class:error={uploadState === "error"}>
                  {uploadMessage}
                </span>
                <span>{Math.round(uploadProgress * 100)}%</span>
              </div>
              <progress value={uploadProgress} max="1">
                {Math.round(uploadProgress * 100)}%
              </progress>
            </div>
          {/if}

          <footer class="create-project-actions">
            <button
              class="button secondary"
              type="button"
              onclick={uploadState === "uploading"
                ? cancelActiveUpload
                : closeCreateProject}
            >
              {uploadState === "uploading" ? "Cancel upload" : "Cancel"}
            </button>
            <button
              class="button"
              type="submit"
              data-state={uploadState === "uploading" ? "loading" : undefined}
              disabled={!canCreateProject}
            >
              {uploadState === "uploading" ? "Uploading" : "Create project"}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  {/if}

  {#if form?.message}
    <p class="helper error" role="alert">{form.message}</p>
  {/if}

  <section class="projects-section" aria-labelledby="project-list-title">
    <div class="section-title-row">
      <div>
        <h2 id="project-list-title">
          {hasActiveSearch ? "Search results" : "All projects"}
        </h2>
        <p class="project-result-count">
          <strong>
            {data.projects.length}
            {data.projects.length === 1 ? "project" : "projects"}
          </strong>
          {#if data.search.query && data.search.includeSubtitles}
            matching project titles or subtitle text for “{data.search.query}”.
          {:else if data.search.query}
            matching project titles for “{data.search.query}”.
          {:else if data.search.includeSubtitles}
            in this workspace. Subtitle text will be included when you search.
          {:else}
            in this workspace, ordered by recent activity.
          {/if}
        </p>
      </div>
    </div>

    {#if data.projects.length === 0}
      <div class="projects-empty">
        <div class="empty-illustration" aria-hidden="true">
          <Icon name="subtitles" size={30} />
        </div>
        {#if hasActiveSearch}
          <h3>No projects match this search</h3>
          <p>
            {data.search.includeSubtitles
              ? "Try a shorter project title or subtitle phrase."
              : "Try another title or include subtitle text in your search."}
          </p>
          <a class="button secondary" href="/">Clear search</a>
        {:else}
          <h3>Your project library is empty</h3>
          <p>
            Import a recording, interview, lecture, or film to create its
            private subtitle workspace.
          </p>
          {#if data.workspace}
            <button class="button" type="button" onclick={openCreateProject}>
              New project
            </button>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="projects-list">
        {#each data.projects as project, index (project.id)}
          {@const projectState = displayState(project)}
          {@const dimensions = formatDimensions(
            project.video_width,
            project.video_height,
          )}
          <article class="project-entry">
            <div class="project-main">
              <a
                class="project-thumbnail-link"
                href={`/projects/${project.id}`}
                aria-label={`Open ${project.name}`}
              >
                <div class="project-thumbnail">
                  {#if project.has_thumbnail}
                    <img
                      src={`/api/projects/${project.id}/derivatives/thumbnail`}
                      alt=""
                      width="640"
                      height="360"
                      loading={index === firstThumbnailIndex ? "eager" : "lazy"}
                      fetchpriority={index === firstThumbnailIndex
                        ? "high"
                        : "auto"}
                    />
                  {:else}
                    {@const placeholder = mediaPlaceholder(project)}
                    <div class="project-thumbnail-placeholder">
                      <Icon name={placeholder.icon} size={28} />
                      <span class="visually-hidden">{placeholder.label}</span>
                    </div>
                  {/if}
                </div>
              </a>

              <div class="project-details">
                <div class="project-title-row">
                  {#if editingProjectId === project.id}
                    <form
                      class="project-title-edit"
                      method="POST"
                      action={renameActionUrl()}
                      use:enhance={enhanceRename}
                    >
                      <input
                        type="hidden"
                        name="projectId"
                        value={project.id}
                      />
                      <label for={`project-title-${project.id}`}>
                        <span class="visually-hidden">Title</span>
                        <input
                          {@attach focusAndSelect}
                          id={`project-title-${project.id}`}
                          name="name"
                          bind:value={renameDraft}
                          required
                          maxlength="160"
                          onkeydown={handleRenameKeydown}
                          aria-invalid={form?.renameProjectId === project.id}
                          aria-describedby={form?.renameProjectId === project.id
                            ? `rename-error-${project.id}`
                            : undefined}
                        />
                      </label>
                      <button
                        class="project-title-action"
                        type="submit"
                        disabled={renameSavingId === project.id}
                        aria-label={renameSavingId === project.id
                          ? "Saving title"
                          : "Save title"}
                        title={renameSavingId === project.id
                          ? "Saving title"
                          : "Save title"}
                      >
                        <Icon name="check" size={15} />
                      </button>
                      <button
                        class="project-title-action"
                        type="button"
                        aria-label="Cancel renaming"
                        title="Cancel renaming"
                        onclick={cancelRename}
                      >
                        <Icon name="close" size={15} />
                      </button>
                      <p
                        class="rename-error"
                        id={`rename-error-${project.id}`}
                        role={form?.renameProjectId === project.id &&
                        form.renameError
                          ? "alert"
                          : undefined}
                      >
                        {form?.renameProjectId === project.id
                          ? (form.renameError ?? "")
                          : ""}
                      </p>
                    </form>
                  {:else}
                    <h3>
                      <a
                        class="project-title-link"
                        href={`/projects/${project.id}`}
                      >
                        {project.name}
                      </a>
                    </h3>
                    <button
                      class="project-rename-trigger"
                      type="button"
                      aria-label={`Rename ${project.name}`}
                      title={`Rename ${project.name}`}
                      onclick={() => beginRename(project.id, project.name)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  {/if}
                  <span class="status" data-status={projectState}>
                    {stateLabel(projectState)}
                  </span>
                </div>
                <p class="project-source">
                  {project.original_filename ?? projectSourceFallback(project)}
                </p>
                <dl class="project-metadata">
                  {#if project.media_duration_us !== null && project.media_duration_us > 0}
                    <div>
                      <dt class="visually-hidden">Duration</dt>
                      <dd>{formatDuration(project.media_duration_us)}</dd>
                    </div>
                  {/if}
                  {#if dimensions}
                    <div>
                      <dt class="visually-hidden">Resolution</dt>
                      <dd>{dimensions}</dd>
                    </div>
                  {/if}
                  {#if project.size_bytes !== null}
                    <div>
                      <dt class="visually-hidden">File size</dt>
                      <dd>{formatBytes(project.size_bytes)}</dd>
                    </div>
                  {/if}
                  {#if project.languages.length > 0}
                    <div>
                      <dt class="visually-hidden">Languages</dt>
                      <dd>{formatLanguages(project.languages)}</dd>
                    </div>
                  {/if}
                  {#if project.track_count > 0 || project.cue_count > 0}
                    <div>
                      <dt class="visually-hidden">Subtitles</dt>
                      <dd>
                        {formatSubtitleCounts(
                          project.track_count,
                          project.cue_count,
                        )}
                      </dd>
                    </div>
                  {/if}
                </dl>
                {#if project.subtitle_match}
                  <span class="subtitle-match">Subtitle text match</span>
                {/if}
              </div>
            </div>

            <div class="project-actions">
              <time datetime={activityDate(project.activity_at).toISOString()}>
                Updated {formatActivity(project.activity_at)}
              </time>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

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
</div>
