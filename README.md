# Anysub

Anysub is a private, local-first transcription and subtitle-authoring web application. This repository is at the foundation stage: it contains the Dockerized application, PostgreSQL schema, resumable media intake, durable worker lease protocol, model-adapter SDK, authentication, and a deterministic end-to-end adapter demo.

The demo deliberately downloads no speech model. Its purpose is to prove the boundary that future Faster-Whisper, WhisperX, Voxtral, Qwen-family, and administrator-built adapters will use.

## Host requirements

- Docker Engine with Docker Compose.
- Git for source control.

Node, pnpm, Python, uv, PostgreSQL, FFmpeg, and application dependencies run in containers. They do not need to be installed on the host.

## Start the production-shaped stack

Copy the environment template and replace its example secrets before exposing the application beyond localhost:

```sh
cp .env.example .env
docker compose up --build
```

Open `http://localhost:5173` and create the installation owner. You can upload a source file into an application-managed project or choose **Run adapter demo**. The demo worker leases its job and creates a normalized subtitle track without downloading a model.

Set `BETTER_AUTH_URL` to the browser-facing origin—including a non-default port—when Anysub is behind a reverse proxy. Resumable upload locations are relative, so uploaded files do not pass through an internal or guessed hostname.

Stop the services without deleting data:

```sh
docker compose down
```

Delete Docker-managed application data only when you explicitly want a clean installation:

```sh
docker compose down --volumes
```

## Containerized development

The development overlay bind-mounts source code but keeps dependency directories in named Docker volumes:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Run checks through the development images:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm check
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm test
docker compose -f compose.yaml -f compose.dev.yaml run --rm worker uv run ruff check .
docker compose -f compose.yaml -f compose.dev.yaml run --rm worker uv run pytest
```

## Repository map

- `apps/web` — SvelteKit application, auth, queue API, PostgreSQL schema, and migrations.
- `workers/inference` — Python worker, public adapter types, discovery, and deterministic adapter.
- `packages/contracts` — language-neutral application/worker TypeScript contracts.
- `docs/ADAPTERS.md` — custom adapter contract and image-extension guide.
- `docs/UPLOADS.md` — resumable upload lifecycle, storage, and reverse-proxy notes.
- `docs/ARCHITECTURE.md` — accepted system boundaries.

## Current limits

This is not a usable transcription release yet. Resumable browser upload and canonical project storage work; the watched inbox, media probing, preview generation, a production speech adapter, the cue editor, export, and the remaining roadmap are not implemented yet.
