# Anysub architecture

Contributor reference for the v4 beta. It describes the system as built and marks everything else as Planned. For the repository layout, conventions, and checks see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Goals

Anysub must give creators and privacy-sensitive teams a capable subtitle workflow without sending media to a third party. A small self-hosted installation should remain simple. The same core must also support additional workers and a managed deployment later.

The architecture favors explicit boundaries, durable state, inspectable storage, and a small service count.

## System overview

The default installation runs three long-lived containers, plus a migration job that exits after it applies pending migrations:

```text
Browser
   |
   v
SvelteKit application  <---->  PostgreSQL
   ^                          projects, tracks,
   |                          revisions, jobs, leases
   |
Worker API
   |
   v
Python worker  <---->  project storage and model cache
```

A future optional LibreTranslate container may provide local translation. Administrators may add workers on the same host. Planned: workers on remote machines, which today cannot read the shared `/data` mount they need (see CONFIGURATION.md).

The default stack does not include Redis, MongoDB, a search service, a reverse proxy, or object storage.

## Technology choices

### Application

- SvelteKit and TypeScript.
- SvelteKit Node adapter for the production server.
- Svelte 5 client code.
- PostgreSQL.
- Drizzle ORM with `node-postgres`. Migrations are hand-written SQL files in `apps/web/migrations`, applied by `apps/web/scripts/migrate.mjs`.
- Better Auth for identity and database-backed sessions.
- Planned: Bits UI for accessible headless primitives.
- Tailwind CSS v4 with a custom Anysub token and component system.
- tus embedded in the Node application for resumable uploads.

### Worker

- Python managed with `uv`.
- A versioned, capability-based adapter SDK using standard Python package entry points.
- Faster-Whisper and CTranslate2 for ASR, through WhisperX.
- WhisperX for accurate forced alignment.
- Planned: Pyannote for optional speaker diarization. It is not a dependency yet.
- FFmpeg and FFprobe for media preparation and inspection.
- Planned: yt-dlp for URL imports. It is not a dependency yet.
- CPU and NVIDIA CUDA worker images.

### Repository

- pnpm workspace for the TypeScript packages and `uv.lock` for the Python worker.
- JSON Schema for the worker contracts, generated from the Pydantic models. See [CONTRIBUTING.md](../CONTRIBUTING.md#contracts).
- AGPL-3.0-only license for the application and worker.
- Planned: Developer Certificate of Origin sign-off for contributions.
- Planned: Astro Starlight for public documentation. Today the documentation is Markdown in `docs/`.
- Planned: ADRs under `docs/adr/` for later decisions that change this direction.

## Application boundary

The SvelteKit application is a modular monolith. It owns:

- Accounts, sessions, and first-run setup.
- Workspaces and memberships. Invitations are planned.
- Projects, media metadata, tracks, cues, and revisions.
- Uploads. Planned: inbox discovery, URL-import requests, and storage policy.
- Queue records, scheduling, and leases.
- Model availability.
- Internal worker APIs.
- Subtitle export and download authorization.
- Planned: search, collections, tags, trash, audit events, provider configuration, and a public automation API.

Modules share one process and database but expose narrow domain functions. Route handlers do not contain business rules.

## Worker boundary

Workers perform expensive or failure-prone media and ML work:

- Probe and prepare media.
- Generate preview proxies, waveform peaks, and thumbnails.
- Download and cache models.
- Transcribe, align, and segment.
- Planned: audio derivatives, URL downloads through yt-dlp, speaker diarization, translation through LibreTranslate, and large export artifacts when application-side generation would block requests.

Workers do not connect to the application database. They poll the internal API, lease compatible work, transfer authorized assets, report progress, and upload versioned results.

This rule protects the domain model from worker implementations and allows remote or managed workers later.

## Model adapter boundary

The worker core does not import Faster-Whisper, WhisperX, or another model library directly. It discovers adapter packages through the `anysub.adapters` Python entry-point group. Each adapter publishes a manifest with its protocol version, adapter version, models, languages, capabilities, and a JSON Schema for model-specific options.

The capabilities are `transcribe` and `align`. Diarization and translation will add their own capabilities once they are built. A model may implement only the capabilities it supports. The scheduler matches jobs against worker manifests instead of assuming a particular library or model family.

Adapters receive typed requests and return normalized, versioned Anysub artifacts. Subtitle storage and the editor therefore do not depend on Faster-Whisper, WhisperX, Voxtral, Qwen, or any other upstream result shape.

Custom adapters are trusted worker code. Administrators install them by building a derived worker image, which isolates their Python and system dependencies from the host and makes the resulting installation reproducible. V1 does not download or execute arbitrary packages in a running worker. A language-neutral sidecar protocol may follow if non-Python adapters demonstrate a concrete need.

## Worker protocol

Workers authenticate with the single shared `ANYSUB_WORKER_TOKEN`. Per-worker enrollment with one-time administrator tokens and revocable credentials is planned and not built. The worker reports:

- Protocol and worker version.
- CPU architecture and thread capacity.
- GPU backend, device, and available memory.
- Installed models.
- Supported pipeline stages.
- Planned: current concurrency and health.

The application grants a time-limited lease for one compatible stage. Workers renew leases through heartbeats every 10 seconds. The application returns an expired lease to the queue after a safety window.

The application lists a worker as connected while it has heard from it in the last 45 seconds, through a lease request, a heartbeat, or a presence announcement. A worker that is waiting for cancelled inference to finish takes no lease, so it posts its manifest to `/api/internal/workers/presence` instead.

Every stage operation must be idempotent. The application accepts a result once for the matching run, stage, attempt, and lease. Retries cannot create duplicate tracks.

Workers read transcription media through a read-only shared mount. Media preparation already downloads its source and uploads derivatives through authenticated transfer endpoints. Planned: transcription moves to the same endpoints so remote workers become possible, and a later object-storage adapter can replace transfers with short-lived object URLs.

## Queue model

PostgreSQL stores durable runs, jobs, attempts, leases, progress, cancellations, and errors. Planned: separate durable stages. The application performs lease transactions and exposes them through the worker API.

The built jobs are `transcribe` and `media_prepare`. A `transcribe` job runs ASR and alignment as one job. Planned: separate durable stages, with diarization as an optional one:

```text
prepare -> transcribe -> align -> diarize? -> segment -> finalize
```

Proxy creation runs inside `media_prepare`. Planned as durable jobs: translation, export, purge, and URL import.

The scheduler leases jobs by priority, then oldest first. Planned: FIFO order within a workspace with fair rotation across workspaces, and worker affinity between related stages without making affinity a correctness requirement.

The default worker runs one job at a time. Administrators can add workers on the same host. A worker resolves compute type, batch size, and thread use from its capabilities and the job's model choice.

## Domain model

### Workspace

A workspace owns projects and configuration. Users join workspaces through memberships with `owner`, `admin`, or `member` roles. V1 avoids project-specific ACL matrices.

### Project

A project contains exactly one canonical source media item. Generated audio, proxy video, waveforms, and thumbnails are derivative assets, not additional source media.

### Run and transcript

A transcription run records the selected adapter, model, and requested options. Its job records attempts, progress, and errors, and the resulting track keeps the adapter version, device, compute type, batch size, and alignment outcome. Planned: the resolved worker and hardware, per-stage timing, and immutable raw output.

Retranscription creates a new run. It does not replace prior output.

### Track and cue

A project can contain multiple subtitle tracks. Tracks come from transcription runs. Planned: tracks from imported subtitle files and translations, with each translated track recording its source lineage.

Cues are the editing unit. Each cue has a stable identity, integer-microsecond timing, and text. Planned: a semantic type and optional speaker or style references. Stable IDs and revisioned commands leave room for simultaneous editing later.

Word tokens retain timestamps, confidence, and optional speaker assignment. Unchanged cues retain their word references; text edits invalidate the affected cue's alignment rather than displaying misleading highlights. Planned: the editor uses word tokens for highlighting, segmentation, karaoke behavior, and social-caption presentation. A future forced re-alignment workflow will rebuild tokens after substantial corrections.

### Revisions

The first editor slice autosaves transactional track snapshots guarded by a monotonic revision. Browser storage journals unsaved changes for crash and connection recovery, and a command stack provides session undo and redo. Later scaling work may replace whole-track snapshots with revisioned command patches without changing the optimistic-concurrency contract.

The server will create checkpoints around editing sessions, destructive bulk operations, and long sessions. Users will be able to name and restore checkpoints. Restoration creates a new head rather than rewriting history.

## Storage

PostgreSQL stores structured metadata and subtitle content. Project storage holds large media and processing artifacts.

The local adapter uses relative keys under an application-managed root:

```text
data/
  workspaces/<workspace-id>/
    projects/<project-id>/
      media/
        original/
        proxy/
        waveform/
        thumbnails/
  staging/
    uploads/
    worker-artifacts/
```

Planned: `audio/` derivatives, `runs/<run-id>/raw/` output, `attachments/`, `exports/`, and `staging/imports/`. Models live in their own `model-cache` volume.

IDs define directories because project titles can change or collide. Users may inspect and back up this layout, but Anysub manages its contents. Planned: users place files in watched inboxes instead of modifying project directories.

Resumable browser uploads use `/data/staging/uploads` and durable PostgreSQL records. On completion, the local storage adapter hard-links the finished staging file into the project directory, commits the canonical key, and removes the staging name. This avoids a second full-file copy while keeping staging recoverable until the database commit succeeds. Staging and canonical project storage therefore remain on the same filesystem in the default deployment.

The storage interface uses relative object keys and streaming operations. A later S3-compatible adapter can map the same keys to object prefixes.

### Canonical ownership

Uploads become canonical project media. Planned: URL downloads and inbox imports do the same, with watched folders acting as staging inboxes. Anysub would copy or filesystem-clone a stable inbox file into project storage and leave the source untouched by default.

V1 does not support permanently linked external media. That mode can follow if archives demonstrate a need that outweighs lifecycle and permission risks.

### Preview proxies

FFprobe inspects every source. Anysub streams a browser-compatible, reliably seekable original when possible. It generates a constant-frame-rate preview proxy when codecs, container, frame behavior, or source size make direct playback unreliable.

Users can inspect the recommendation and create, cancel, delete, or regenerate a proxy. Planned: administrators choose an automatic, ask-first, or disabled policy. Cue times remain relative to the original timeline.

## Ingest

All ingest adapters produce the same canonical media record. tus browser upload is built. Planned: a watched mounted inbox, direct HTTP URLs, and yt-dlp URLs.

tus uploads stream to workspace-scoped staging, resume after interruption, and become visible to workers only after finalization. Reverse-proxy examples must preserve tus methods and headers and disable harmful buffering.

Planned: the yt-dlp adapter uses its Python API, controlled output paths, and progress hooks. Anysub would pin yt-dlp through `uv.lock` and not expose arbitrary flags or browser-cookie extraction in v1.

## Processing pipeline

The UI exposes product choices rather than implementation libraries:

- Model selection.
- Accurate timing or fast timing.
- Independent speaker-diarization toggle, once diarization is built.
- Language and advanced subtitle settings.

Accurate timing is the default. Faster-Whisper performs ASR and WhisperX performs forced alignment. Fast timing skips alignment and keeps segment-level timing.

Diarization is planned as an optional Pyannote stage. Administrators accept the model terms and provide a Hugging Face token for initial download. Anysub disables Pyannote telemetry. Users may provide automatic, exact, or bounded speaker counts.

Each first-party implementation is an adapter package. The worker normalizes all upstream results into Anysub schemas. Stored projects do not depend on WhisperX, Faster-Whisper, Pyannote, or another adapter's result shapes.

## Model management

Models live in a persistent cache shared across worker upgrades and CPU/GPU image changes. Faster-Whisper and WhisperX use the same CTranslate2 ASR weights. Alignment and diarization require additional models.

The model picker lists available models with their purpose, approximate size, download state, and hardware fit. Models download on first use. Planned: an administrator model manager that downloads with progress, retry, and cancellation, removes unused models, reports cache and authorization errors, and supports documented offline cache seeding.

Docker images do not bundle large model weights.

## Translation

Translation is not built yet. The plan is LibreTranslate behind an internal translation-provider interface. Administrators would enable an optional Compose profile or configure an existing LibreTranslate endpoint.

Translation creates a new track. The translation workflow may merge, split, and reflow cues to meet target-language reading rules while retaining source lineage and overall spoken intervals.

A later OpenAI-compatible provider can support local Ollama or llama.cpp servers and explicitly approved external services. V1 contains no such adapter.

## Editor and design system

Anysub uses a calm, utilitarian workbench with editorial polish. The interface avoids decorative AI styling and gives media, cues, timing, warnings, and transport controls the visual emphasis.

The design system uses:

- Tailwind CSS v4 for layout and state styling.
- Custom semantic tokens in OKLCH.
- Purpose-built timeline, waveform, cue, quality, and transport components.
- Complete default, hover, focus, active, disabled, loading, error, and success states.
- Visible focus and keyboard operation.
- Planned: Bits UI for accessible headless behavior, reduced motion, and tested light and dark themes.

The full editor targets desktop and tablet landscape. Small screens provide playback, review, project status, flags, and light cue-text correction without squeezing the desktop timeline into a phone layout.

Anysub does not modify media. Live preview and subtitle-file export stay inside the product boundary. V1 does not encode captioned video.

## Subtitle quality

The editor flags empty cues, cues over the line length, durations under 0.5 or over 7 seconds, more than 20 characters per second, and overlaps. Fixes happen only through explicit, reversible user actions.

Planned: tracks target a versioned quality profile. Built-in profiles would cover general creator, long-form, social, education/accessibility, and conservative broadcast-style use, and users would clone built-ins to create workspace profiles. Profiles would control line length, line count, CPS, duration, gaps, overlaps, punctuation, and segmentation.

Planned: manual SDH cues, speaker identification, and non-speech semantics. V1 does not detect sound events automatically.

## Time model

The database stores cue and word time as integer microseconds. The UI displays clock time, nudges cues by milliseconds, and steps the playhead by frames. Planned: frame-based timecode display.

Media metadata records detected frame rates and variable-frame-rate behavior. The editor derives its frame step from common fractional rates. Planned: drop-frame display. Preview proxies provide a reliable constant-frame-rate editing surface when the source does not.

## Search and organization

Built: the library does a case-insensitive substring match over project names and, when the subtitle scope is chosen, over cue text. Planned: PostgreSQL provides workspace-scoped search over projects, cues, speakers, languages, and tags. Full-text indexes handle supported languages. Language-neutral tokenization and trigram indexes provide a multilingual fallback.

Results include context and media timestamps. Filters cover project, owner, date, language, speaker, track type, tag, and run state.

Projects use flat collections and tags. V1 does not implement nested folders or mirror UI organization onto storage paths.

## Authentication and authorization

Authentication stays enabled in every deployment. Public sign-up is disabled. The first-run setup page creates the single owner in one transaction, and no other way to create accounts exists yet. Planned: later users join by expiring invitation.

Better Auth manages identities, password credentials, secure cookies, and database sessions. Anysub owns workspaces, memberships, and authorization checks. Invitations are planned.

V1 requires no SMTP. Password reset and invitations are not built. Planned: administrators copy invitation and password-reset links. SMTP, passkeys, OIDC, and SSO remain future additions.

A monotonic track revision rejects a save made against an older copy, so concurrent edits surface as a conflict instead of overwriting each other. Planned: one active editor lease protects a track from concurrent changes, other users may view the track, and an authorized member may take over an abandoned lease. V1 does not implement real-time co-editing.

## Security and privacy

- Anysub sends zero telemetry.
- Logs omit transcript text, media content, credentials, and sensitive filenames by default.
- Workers share one installation-wide token. Planned: remote workers enroll through the administrator and receive narrowly scoped credentials.
- Planned: remote worker traffic requires HTTPS outside the Compose network.
- Passwords and job lease tokens use one-way hashing.
- Planned: integration secrets receive encryption with an installation key kept outside PostgreSQL.
- Project media and database content use host-level storage encryption rather than application encryption.
- Documentation states the storage, transport, and remote-worker trust boundaries.
- Workers count as installation-wide trusted compute in self-hosted v1.

The application exposes a health endpoint. Planned: a readiness endpoint, and a redacted diagnostic bundle for administrators that contains versions, hardware, configuration shape, job IDs, and recent errors without content data.

## API boundaries

Planned, not built: a public REST API covers stable automation workflows and uses a versioned namespace. Scoped personal access tokens authenticate API clients. Anysub publishes an OpenAPI document.

The editor may use private endpoints while patch and collaboration semantics mature. Leases, artifact transfers, and results live under `/api/internal`, authenticated by the shared worker token. Worker enrollment is planned.

## Operations

The default Compose stack exposes one HTTP application port. Anysub does not manage TLS or certificates. Planned: tested configurations for common reverse proxies.

Administrators perform explicit upgrades with matching, immutable application and worker image versions. The migration script applies pending migrations in order under a PostgreSQL advisory lock, so concurrent starts cannot apply the same migration twice. It does not check upgrade paths yet.

Anysub does not claim rollback after an incompatible database migration. Administrators restore a backup when rollback requires older data structures.

Backup tooling starts as a CLI enhancement after the core workflow. A supported backup pairs a PostgreSQL dump with a storage manifest and optionally canonical media. Model caches, proxies, thumbnails, and staging remain excluded by default.

## Localization

V1 ships the UI and documentation in English. Planned: an internationalization message system. Subtitle content supports Unicode, BCP 47 language tags, RTL text, and mixed-direction cues.

## Roadmap: managed-service compatibility

Not built. The initial build does not implement managed-service infrastructure. These boundaries keep that path open:

- Every project belongs to a workspace.
- Workers use an authenticated protocol and never access the database.
- Storage uses relative object keys behind an adapter.
- Jobs, stages, leases, attempts, and usage parameters remain durable.
- Public APIs use versioned contracts.
- The application records provider and schema versions.

A managed deployment can add object storage, autoscaling, tenant quotas, billing, regional placement, and isolated worker pools around the same product core.

## Roadmap: deferred decisions

Not decided and not built.

- External and OpenAI-compatible translation providers.
- Language-neutral out-of-process adapter protocol.
- Simultaneous editing and CRDT choice.
- S3-compatible storage implementation.
- AMD and other accelerator backends.
- SMTP, passkeys, OIDC, and SSO.
- Full UI localization.
- Rendered caption-video export.
- Live recording and streaming transcription.
- Generative summaries, chapters, semantic search, and cleanup.
