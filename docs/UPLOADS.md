# Media uploads

Status: resumable browser uploads and worker-backed media preparation implemented. Watched inboxes and abandoned-upload reconciliation follow.

Anysub owns the canonical copy of project media. A browser upload first lands in staging and becomes the one source item for a new project only after every byte has arrived.

## What happens during an upload

1. The browser opens a focused project dialog, then creates a tus upload with the project name, source filename, media type, byte length, and workspace ID.
2. The application checks the signed-in user's workspace membership, normalizes the requested project name, and creates a draft project plus a durable upload record.
3. The browser sends 32 MiB chunks. tus fingerprints the local file so an interrupted upload can resume after a reload.
4. The application checks ownership again on every item request and persists coarse progress in PostgreSQL.
5. On completion, the application hard-links the staging file into the canonical project directory, commits the final storage key, then removes the staging name and tus metadata.

The hard-link step is constant-time and does not duplicate a multi-gigabyte film. Both names remain valid until the database commit succeeds, which gives recovery code a stable staging file if finalization is interrupted. The default Docker volume keeps staging and project storage on one filesystem, as this operation requires.

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

The original display filename remains in PostgreSQL. Paths never contain a project title or browser-supplied directory component.

## Media preparation

Completing an upload queues a durable `media_prepare` job. A compatible worker downloads the canonical source through its active lease, probes it with FFprobe, and returns versioned derivatives through resumable, offset-checked artifact uploads.

The worker produces:

- A compact, multilevel waveform JSON artifact for every source with audio.
- A JPEG thumbnail for every source with a video stream.
- An H.264/AAC MP4 editing proxy only when the browser cannot play the source directly or FFmpeg detects variable frame timing.

PostgreSQL stores normalized stream metadata, integer-microsecond duration, rational frame rate, seekability, preparation status, and one record per derivative. Files live under the project directory; incomplete worker artifacts remain under `staging/worker-artifacts/<job-id>` until completion, failure, cancellation, or lease recovery removes them.

The project workspace reports preparation progress and lets a member cancel or retry the active job. Regeneration keeps existing ready derivatives available until the replacement transaction commits. Members can delete an individual derivative without deleting the canonical source.

## Re-uploading and duplicate content

An interrupted upload of the same local file in the same browser resumes its existing tus upload and draft project. After an upload completes, Anysub removes that browser resume fingerprint. Uploading the file again then creates a separate project with a new project ID and a separate canonical media file. Project display names are derived from the filename stem and do not need to be unique, so two projects can both be named `Interview` without sharing a storage path.

Anysub does not currently hash or deduplicate completed media. This is intentional for the first alpha: reference-safe deletion, backups, permissions, and tenant boundaries need to be designed together before files share physical storage. A future content-addressed storage layer may reuse identical media inside a workspace while keeping projects and their metadata independent. Managed-service cross-workspace deduplication should remain disabled by default to avoid cross-tenant information leaks.

Deleting a project removes its database records, canonical project directory, and any known incomplete tus staging files. Owners and administrators can delete any workspace project; a member can delete a project they created. Transcript deletion is narrower: it removes the selected cues, source processing run, job result, and retry history while retaining the project media.

## Reverse proxies

Set `BETTER_AUTH_URL` to the exact origin users open in their browsers:

```dotenv
BETTER_AUTH_URL=https://subtitles.example.org
```

Compose passes the same value to SvelteKit as `ORIGIN`. tus returns relative upload locations, so it does not need to trust forwarded host headers. Your proxy must allow `POST`, `HEAD`, `PATCH`, `DELETE`, and `OPTIONS`, preserve request bodies without buffering the entire upload, and use timeouts suitable for the chosen chunk size.

Anysub does not ship a reverse proxy. Its upload endpoint rejects missing sessions and rejects browser `Origin` values that do not match `BETTER_AUTH_URL`.

## Limits and cleanup

`ANYSUB_MAX_UPLOAD_BYTES` controls the maximum complete source size in bytes. The default is 500 GiB. `ANYSUB_BODY_SIZE_LIMIT` controls SvelteKit's per-request streaming limit and defaults to 64 MiB so it can accept one 32 MiB tus chunk. Keep the latter larger than the browser chunk size. Browser uploads must declare a non-zero length; deferred-length uploads are not accepted by this first implementation.

Incomplete tus files carry a seven-day expiration policy, but the scheduled cleanup and startup reconciliation pass are still required before the public alpha. Until then, cancelling from the active browser removes the draft project and staging upload, while abandoned files remain eligible for the later cleanup pass.

Watched inboxes will feed the same project and storage lifecycle. They will not bypass canonical ownership or create permanently linked external media.
