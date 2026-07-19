# Anysub

Anysub is a private, local-first transcription and subtitle-authoring web application. This repository is at the foundation stage: it contains the Dockerized application, PostgreSQL schema, durable worker lease protocol, model-adapter SDK, authentication, and a deterministic end-to-end adapter demo.

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

Open `http://localhost:5173`, create the installation owner, and choose **Run adapter demo**. The local worker leases the job and creates a normalized subtitle track.

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
- `docs/ARCHITECTURE.md` — accepted system boundaries.

## Current limits

This is the first tracer slice, not a usable transcription release. Media upload, preview generation, a production speech adapter, the cue editor, export, and the remaining roadmap are not implemented yet.
