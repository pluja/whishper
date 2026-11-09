# Uploads and media preparation

How a browser upload becomes project media, and how the worker prepares it. For the user view see [USER-GUIDE.md](USER-GUIDE.md#uploading-media). For limits and proxy settings see [CONFIGURATION.md](CONFIGURATION.md#uploads) and [INSTALL.md](INSTALL.md#reverse-proxy).

Anysub owns the canonical copy of project media. An upload first lands in staging and becomes the one source item of a new project only after every byte has arrived.

## Upload lifecycle

1. The browser opens a project dialog, then creates a tus upload with the project name, source filename, media type, byte length, and workspace ID.
2. The application checks the signed-in user's workspace membership, normalizes the project name, and creates a draft project plus a durable upload record.
3. The browser sends 32 MiB chunks. tus fingerprints the local file so an interrupted upload resumes after a reload.
4. The application checks ownership on every request and persists coarse progress in PostgreSQL.
5. On completion, the application hard-links the staging file into the canonical project directory, commits the final storage key, then removes the staging name and tus metadata.

The hard link is constant-time and does not duplicate a multi-gigabyte file. Both names stay valid until the database commit succeeds, so recovery code always has a staging file if finalization is interrupted. This requires staging and project storage on one filesystem, which the default `app-data` volume provides.

The upload endpoint rejects requests without a session, and the application rejects cross-site requests that a browser marks through `Sec-Fetch-Site` or an `Origin` from another host. Only audio and video media types are accepted, and deferred-length uploads are refused. Media is served back with its type and `X-Content-Type-Options: nosniff`. tus returns relative upload locations, so it does not trust forwarded host headers.

Canonical files use stable IDs and a normalized source name:

```text
data/
  workspaces/<workspace-id>/
    projects/<project-id>/
      media/
        original/
          source.<extension>
  staging/
    uploads/
```

The original display filename stays in PostgreSQL. Paths never contain a project title or a browser-supplied directory component.

## Media preparation

Completing an upload queues a durable `media_prepare` job. A compatible worker reads the canonical source from the shared data mount, or downloads it through its active lease when it has no mount, probes it with FFprobe, and returns derivatives through resumable, offset-checked artifact uploads.

The worker produces:

- A compact, multilevel waveform JSON artifact for every source with audio.
- A JPEG thumbnail for every source with a video stream.
- An H.264/AAC MP4 editing proxy only when the browser cannot play the source directly or FFmpeg detects variable frame timing.

PostgreSQL stores normalized stream metadata, integer-microsecond duration, rational frame rate, seekability, preparation status, and one record per derivative. Derivatives live under the project directory. Incomplete artifacts stay in `staging/worker-artifacts/<job-id>` until completion, failure, cancellation, or lease recovery removes them.

A member can cancel or retry the active job and delete an individual derivative without touching the source. Regeneration keeps existing ready derivatives available until the replacement commits.

## Duplicate content

An interrupted upload of the same file in the same browser resumes its existing tus upload and draft project. After completion the browser fingerprint is removed, so uploading the file again creates a separate project with its own canonical file.

Anysub does not hash or deduplicate completed media. Reference-safe deletion, backups, permissions, and tenant boundaries need to be designed together before files share physical storage. Roadmap: a content-addressed layer that reuses identical media inside one workspace while keeping project metadata independent.

## Deletion

Deleting a project removes its database records, its canonical directory, and any known incomplete tus staging files. Owners and administrators can delete any project in the workspace. A member can delete projects they created. Deleting a transcript is narrower: it removes the selected cues, the source run, the job result, and the retry history, and keeps the media.

## Maintenance sweep

A sweep starts with the server and then runs every 15 minutes. A PostgreSQL advisory lock lets one sweep run at a time across several application instances. Each pass:

- retries finalization for uploads whose tus file is complete but whose row is not `completed`, once the row has been idle for 10 minutes;
- marks an upload `failed` when its staged file is missing, or when finalization still fails 24 hours after its first attempt;
- deletes uploads that started more than seven days ago and never completed, with their staged files and placeholder projects;
- removes orphaned tus files past the same seven-day expiry.
