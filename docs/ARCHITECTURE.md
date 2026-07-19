# Anysub architecture

Status: accepted direction after the initial architecture interview. Implementation may refine details through ADRs and measured prototypes.

## Goals

Anysub must give creators and privacy-sensitive teams a capable subtitle workflow without sending media to a third party. A small self-hosted installation should remain simple. The same core must also support additional workers and a managed deployment later.

The architecture favors explicit boundaries, durable state, inspectable storage, and a small service count.

## System overview

The default installation runs three containers:

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

An optional LibreTranslate container provides local translation. Administrators may add workers on the same host or remote machines.

The default stack does not include Redis, MongoDB, a search service, a reverse proxy, or object storage.

## Technology choices

### Application

- SvelteKit and TypeScript.
- SvelteKit Node adapter for the production server.
- Svelte 5 client code.
- PostgreSQL.
- Drizzle ORM with `node-postgres`.
- Better Auth for identity and database-backed sessions.
- Bits UI for accessible headless primitives.
- Tailwind CSS v4 with a custom Anysub token and component system.
- tus embedded in the Node application for resumable uploads.

### Worker

- Python managed with `uv`.
- Faster-Whisper and CTranslate2 for ASR.
- WhisperX for accurate forced alignment.
- Pyannote for optional speaker diarization.
- FFmpeg and FFprobe for media preparation and inspection.
- yt-dlp for URL imports.
- CPU and NVIDIA CUDA worker images.

### Repository and documentation

- pnpm workspace for TypeScript packages.
- `uv.lock` for the Python worker.
- JSON Schema for language-neutral worker contracts.
- Astro Starlight for public documentation.
- ADRs under `docs/adr/` for later decisions that change this direction.
- AGPL-3.0-only license for the application and worker.
- Developer Certificate of Origin sign-off for contributions.

## Application boundary

The SvelteKit application is a modular monolith. It owns:

- Accounts, sessions, and first-run setup.
- Workspaces, memberships, and invitations.
- Projects, media metadata, tracks, cues, and revisions.
- Uploads, inbox discovery, URL-import requests, and storage policy.
- Queue records, scheduling, leases, and worker enrollment.
- Search, collections, tags, trash, and audit events.
- Model availability and provider configuration.
- Public automation and internal worker APIs.
- Export orchestration and download authorization.

Modules share one process and database but expose narrow domain functions. Route handlers do not contain business rules.

## Worker boundary

Workers perform expensive or failure-prone media and ML work:

- Probe and prepare media.
- Generate preview proxies, audio derivatives, waveform peaks, and thumbnails.
- Download URL media through yt-dlp.
- Download and cache models.
- Transcribe, align, diarize, and segment.
- Translate through LibreTranslate.
- Generate large export artifacts when application-side generation would block requests.

Workers do not connect to the application database. They poll the internal API, lease compatible work, transfer authorized assets, report progress, and upload versioned results.

This rule protects the domain model from worker implementations and allows remote or managed workers later.

## Worker protocol

Each worker enrolls through a one-time administrator token and receives a revocable credential. The worker reports:

- Protocol and worker version.
- CPU architecture and thread capacity.
- GPU backend, device, and available memory.
- Installed models.
- Supported pipeline stages.
- Current concurrency and health.

The application grants a time-limited lease for one compatible stage. Workers renew leases through heartbeats. The application returns an expired lease to the queue after a safety window.

Every stage operation must be idempotent. The application accepts a result once for the matching run, stage, attempt, and lease. Retries cannot create duplicate tracks.

Local workers may read project assets through a read-only shared mount. Remote workers use authenticated transfer endpoints. A later object-storage adapter can replace transfers with short-lived object URLs.

## Queue model

PostgreSQL stores durable runs, stages, attempts, leases, progress, cancellation requests, and errors. The application performs lease transactions and exposes them through the worker API.

One user-visible run contains durable stages:

```text
prepare -> transcribe -> align -> diarize? -> segment -> finalize
```

Translation, proxy creation, export, purge, and URL import also use durable jobs.

The scheduler provides FIFO order within a workspace and fair rotation across workspaces. It prefers worker affinity between related stages without making affinity a correctness requirement.

The default worker runs conservative concurrency. Administrators can add workers and resource limits. A worker resolves compute type, batch size, and thread use from its capabilities and the job's model choice.

## Domain model

### Workspace

A workspace owns projects and configuration. Users join workspaces through memberships with `owner`, `admin`, or `member` roles. V1 avoids project-specific ACL matrices.

### Project

A project contains exactly one canonical source media item. Generated audio, proxy video, waveforms, and thumbnails are derivative assets, not additional source media.

### Run and transcript

A transcription run records:

- Selected model and requested options.
- Resolved worker, hardware, compute, and batch settings.
- Provider and component versions.
- Stage attempts, artifacts, timing, and errors.
- Immutable raw output normalized into Anysub's versioned schema.

Retranscription creates a new run. It does not replace prior output.

### Track and cue

A project can contain multiple subtitle tracks. Tracks may come from a run, an imported subtitle file, or a translation. Each translated track records its source lineage.

Cues are the editing unit. Each cue has a stable identity, integer-microsecond timing, text, semantic type, and optional speaker or style references. Stable IDs and revisioned commands leave room for simultaneous editing later.

Word tokens retain timestamps, confidence, language, and optional speaker assignment. The editor uses them for highlighting, segmentation, karaoke behavior, and social-caption presentation. Manual edits preserve matching word references. A user can request forced re-alignment after substantial corrections.

### Revisions

The editor autosaves revisioned patches with optimistic concurrency. Browser storage journals unsaved changes for crash and connection recovery. A command stack provides session undo and redo.

The server creates checkpoints around editing sessions, destructive bulk operations, and long sessions. Users may name and restore checkpoints. Restoration creates a new head rather than rewriting history.

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
        audio/
        waveform/
        thumbnails/
      runs/<run-id>/
        raw/
      attachments/
      exports/
  staging/
    uploads/
    imports/
  models/
```

IDs define directories because project titles can change or collide. Users may inspect and back up this layout, but Anysub manages its contents. Users place files in watched inboxes instead of modifying project directories.

The storage interface uses relative object keys and streaming operations. A later S3-compatible adapter can map the same keys to object prefixes.

### Canonical ownership

Uploads, URL downloads, and inbox imports become canonical project media. Watched folders act as staging inboxes. Anysub copies or filesystem-clones a stable inbox file into project storage and leaves the source untouched by default.

V1 does not support permanently linked external media. That mode can follow if archives demonstrate a need that outweighs lifecycle and permission risks.

### Preview proxies

FFprobe inspects every source. Anysub streams a browser-compatible, reliably seekable original when possible. It generates a constant-frame-rate preview proxy when codecs, container, frame behavior, or source size make direct playback unreliable.

Users can inspect the recommendation and create, cancel, delete, or regenerate a proxy. Administrators choose automatic, ask-first, or disabled policy. Cue times remain relative to the original timeline.

## Ingest

All ingest adapters produce the same canonical media record:

- tus browser upload.
- Watched mounted inbox.
- Direct HTTP URL.
- yt-dlp URL.

tus uploads stream to workspace-scoped staging, resume after interruption, and become visible to workers only after finalization. Reverse-proxy examples must preserve tus methods and headers and disable harmful buffering.

The yt-dlp adapter uses its Python API, controlled output paths, and progress hooks. Anysub pins yt-dlp through `uv.lock` and does not expose arbitrary flags or browser-cookie extraction in v1.

## Processing pipeline

The UI exposes product choices rather than implementation libraries:

- Model selection.
- Accurate timing or fast timing.
- Independent speaker-diarization toggle.
- Language and advanced subtitle settings.

Accurate timing is the default. Faster-Whisper performs ASR and WhisperX performs forced alignment. Fast timing uses Faster-Whisper word timestamps without alignment.

Diarization uses Pyannote as an optional stage. Administrators accept the model terms and provide a Hugging Face token for initial download. Anysub disables Pyannote telemetry. Users may provide automatic, exact, or bounded speaker counts.

The worker normalizes all upstream results into Anysub schemas. Stored projects do not depend on WhisperX, Faster-Whisper, or Pyannote result shapes.

## Model management

Models live in a persistent cache shared across worker upgrades and CPU/GPU image changes. Faster-Whisper and WhisperX use the same CTranslate2 ASR weights. Alignment and diarization require additional models.

The administrator model manager:

- Lists available and installed models.
- Shows purpose, approximate size, and hardware fit.
- Downloads with progress, retry, and cancellation.
- Removes unused models.
- Reports cache and authorization errors.
- Supports documented offline cache seeding.

Docker images do not bundle large model weights.

## Translation

V1 supports LibreTranslate through an internal translation-provider interface. Administrators may enable an optional Compose profile or configure an existing LibreTranslate endpoint.

Translation creates a new track. The translation workflow may merge, split, and reflow cues to meet target-language reading rules while retaining source lineage and overall spoken intervals.

A later OpenAI-compatible provider can support local Ollama or llama.cpp servers and explicitly approved external services. V1 contains no such adapter.

## Editor and design system

Anysub uses a calm, utilitarian workbench with editorial polish. The interface avoids decorative AI styling and gives media, cues, timing, warnings, and transport controls the visual emphasis.

The design system uses:

- Bits UI for accessible headless behavior.
- Tailwind CSS v4 for layout and state styling.
- Custom semantic tokens in OKLCH.
- Purpose-built timeline, waveform, cue, quality, and transport components.
- Complete default, hover, focus, active, disabled, loading, error, and success states.
- Visible focus, keyboard operation, reduced motion, and tested light/dark themes.

The full editor targets desktop and tablet landscape. Small screens provide playback, review, project status, flags, and light cue-text correction without squeezing the desktop timeline into a phone layout.

Anysub does not modify media. Live preview and subtitle-file export stay inside the product boundary. V1 does not encode captioned video.

## Subtitle quality

Tracks target a versioned quality profile. Built-in profiles cover general creator, long-form, social, education/accessibility, and conservative broadcast-style use. Users clone built-ins to create workspace profiles.

Profiles control line length, line count, CPS, duration, gaps, overlaps, punctuation, and segmentation. Anysub reports violations and applies fixes only after an explicit, reversible user action.

Anysub supports manual SDH cues, speaker identification, and non-speech semantics. V1 does not detect sound events automatically.

## Time model

The database stores cue and word time as integer microseconds. The UI can display clock time or frame-based timecode and can nudge by milliseconds or frames.

Media metadata records detected frame rates and variable-frame-rate behavior. The editor handles common fractional rates and relevant drop-frame display. Preview proxies provide a reliable constant-frame-rate editing surface when the source does not.

## Search and organization

PostgreSQL provides workspace-scoped search over projects, cues, speakers, languages, and tags. Full-text indexes handle supported languages. Language-neutral tokenization and trigram indexes provide a multilingual fallback.

Results include context and media timestamps. Filters cover project, owner, date, language, speaker, track type, tag, and run state.

Projects use flat collections and tags. V1 does not implement nested folders or mirror UI organization onto storage paths.

## Authentication and authorization

Authentication stays enabled in every deployment. First launch creates the owner. Later users join by expiring invitation.

Better Auth manages identities, password credentials, secure cookies, and database sessions. Anysub owns workspaces, memberships, invitations, and authorization checks.

V1 requires no SMTP. Administrators copy invitation and password-reset links. SMTP, passkeys, OIDC, and SSO remain future additions.

One active editor lease protects a track from concurrent changes. Other users may view the track and an authorized member may take over an abandoned lease. V1 does not implement real-time co-editing.

## Security and privacy

- Anysub sends zero telemetry.
- Logs omit transcript text, media content, credentials, and sensitive filenames by default.
- Remote workers require administrator enrollment and narrowly scoped credentials.
- Remote worker traffic requires HTTPS outside the Compose network.
- Passwords and access tokens use one-way hashing.
- Integration secrets receive encryption with an installation key kept outside PostgreSQL.
- Project media and database content use host-level storage encryption rather than application encryption.
- Documentation states the storage, transport, and remote-worker trust boundaries.
- Workers count as installation-wide trusted compute in self-hosted v1.

The application exposes health and readiness endpoints. Administrators can download a redacted diagnostic bundle that contains versions, hardware, configuration shape, job IDs, and recent errors without content data.

## API boundaries

The public REST API covers stable automation workflows and uses a versioned namespace. Scoped personal access tokens authenticate API clients. Anysub publishes an OpenAPI document.

The editor may use private endpoints while patch and collaboration semantics mature. Worker enrollment, leases, artifact transfers, and results live under a separate internal API namespace.

## Operations

The default Compose stack exposes one HTTP application port. Anysub does not manage TLS or certificates. Documentation provides tested configurations for common reverse proxies.

Administrators perform explicit upgrades with matching, immutable application and worker image versions. The application applies supported migrations under a PostgreSQL advisory lock and refuses unsupported upgrade jumps.

Anysub does not claim rollback after an incompatible database migration. Administrators restore a backup when rollback requires older data structures.

Backup tooling starts as a CLI enhancement after the core workflow. A supported backup pairs a PostgreSQL dump with a storage manifest and optionally canonical media. Model caches, proxies, thumbnails, and staging remain excluded by default.

## Testing

Every pull request must run without a GPU or large model download:

- Vitest for TypeScript domain, server, and Svelte component tests.
- Playwright for browser workflows and failure traces.
- pytest for worker logic and protocol tests.
- Real PostgreSQL for integration tests.
- A deterministic fake inference adapter for end-to-end tests.
- Versioned contract fixtures shared across languages.
- Small redistributable media and subtitle fixtures.

Scheduled and release jobs run a tiny real model on CPU. GPU tests run separately when suitable hardware is available.

## Documentation

Astro Starlight builds the documentation site from the monorepo. User-facing changes update documentation in the same pull request.

The documentation prioritizes task guides, deployment examples, troubleshooting, and copyable diagnostics. Contributor documentation explains domain language, module ownership, contracts, and ADRs.

V1 ships the UI and documentation in English. Code uses an internationalization message system from the start. Subtitle content supports Unicode, BCP 47 language tags, RTL text, and mixed-direction cues.

## Managed-service compatibility

The initial build does not implement managed-service infrastructure. These boundaries keep that path open:

- Every project belongs to a workspace.
- Workers use an authenticated protocol and never access the database.
- Storage uses relative object keys behind an adapter.
- Jobs, stages, leases, attempts, and usage parameters remain durable.
- Public APIs use versioned contracts.
- The application records provider and schema versions.

A managed deployment can add object storage, autoscaling, tenant quotas, billing, regional placement, and isolated worker pools around the same product core.

## Deferred decisions

- External and OpenAI-compatible translation providers.
- Runtime plugin protocol.
- Simultaneous editing and CRDT choice.
- S3-compatible storage implementation.
- AMD and other accelerator backends.
- SMTP, passkeys, OIDC, and SSO.
- Full UI localization.
- Rendered caption-video export.
- Live recording and streaming transcription.
- Generative summaries, chapters, semantic search, and cleanup.
