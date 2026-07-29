# Anysub

Anysub is a private, local-first transcription and subtitle-authoring web application. It contains the Dockerized application, PostgreSQL schema, resumable media intake, durable worker lease protocol, model-adapter SDK, authentication, and a CPU-first WhisperX transcription path with accurate word alignment.

## Host requirements

- Docker Engine with Docker Compose.
- Git for source control.

Node, pnpm, Python, uv, PostgreSQL, FFmpeg, and application dependencies run in containers. They do not need to be installed on the host.

## Start the production-shaped stack

Generate an environment file with unique secrets, then start the stack:

```sh
./scripts/init-env.sh
docker compose up --build
```

Compose refuses to start without `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `ANYSUB_WORKER_TOKEN`. The application then refuses to start if one of them still holds a placeholder from `.env.example`. This repository publishes those placeholders, so anyone who reads the source can forge sessions against a server that keeps them.

Read `.env.example` to learn what each variable does, but do not copy it into place. Rotating `BETTER_AUTH_SECRET` later signs every account out.

Open `http://localhost:5173`, create the installation owner, and upload a source. Open the project, choose a model, and start transcription. `Small` is the sensible CPU default. The first run downloads its ASR and language-alignment models into the persistent `model-cache` volume; later runs reuse them.

Model downloads require internet access. Once the required files are cached, media processing itself is local. Anysub disables Hugging Face and Pyannote telemetry in the worker environment.

Set `BETTER_AUTH_URL` to the browser-facing origin, including a non-default port, when Anysub is behind a reverse proxy. Resumable upload locations are relative, so uploaded files do not pass through an internal or guessed hostname.

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

- `apps/web`: SvelteKit application, auth, queue API, PostgreSQL schema, and migrations.
- `workers/inference`: Python worker, public adapter types, discovery, and deterministic adapter.
- `packages/contracts`: language-neutral application/worker TypeScript contracts.
- `docs/ADAPTERS.md`: custom adapter contract and image-extension guide.
- `docs/UPLOADS.md`: resumable upload lifecycle, storage, and reverse-proxy notes.
- `docs/TRANSCRIPTION.md`: model choices, first-run behavior, and troubleshooting.
- `docs/EDITOR.md`: cue editing, autosave, recovery, quality warnings, and exports.
- `docs/ARCHITECTURE.md`: accepted system boundaries.

## Current limits

The core subtitle journey is implemented: upload, enqueue, WhisperX ASR/alignment, persisted cues and word timestamps, FFprobe media preparation, the waveform timeline, synchronized cue editing, durable autosave, browser crash recovery, and SRT/WebVTT/Anysub JSON export. Generated preview proxies, watched inboxes, revision checkpoints, editor leases, diarization, translation, and the model-management UI remain on the roadmap.

## Development disclosure

Large language models assisted in writing this project, covering application code, worker code, and documentation. A human always reviews, tests and accepts the LLM changes before shipping.

## License

Anysub is licensed under the GNU Affero General Public License, version 3 only. See [LICENSE](LICENSE).
