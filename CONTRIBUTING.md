# Contributing

Thanks for helping with Anysub. This page covers the layout, conventions, and checks. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the system fits together and why. Report security problems through [SECURITY.md](SECURITY.md), not as public issues.

## Repository layout

```text
apps/web/                 SvelteKit application, migrations, deployment scripts
  src/lib/server/         Server-only code, one folder per domain
  src/lib/                Client code, one folder per feature
  migrations/             Hand-written SQL, applied by scripts/migrate.mjs
  scripts/                Migration runner and health check
  tests/                  Tests that read repository files (Compose, .env)
workers/inference/        Python worker
  src/anysub_worker/      Worker package
  tests/                  pytest suite
packages/contracts/       JSON Schema and the TypeScript generated from it
docs/                     User and contributor documentation
scripts/init-env.sh       Writes .env from .env.example
compose.yaml              Production stack
compose.dev.yaml          Development overlay
compose.cuda.yaml         NVIDIA overlay
```

Server domain folders in `apps/web/src/lib/server/`: `auth`, `db`, `http`, `jobs`, `media`, `projects`, `storage`, `subtitles`, `transcription`, `uploads`, `workers`.

Client folders in `apps/web/src/lib/`: `shared` (code used by server and client), `browser`, `library`, `studio`, `editor`, `timeline`, `components`.

Worker modules in `anysub_worker`: `models` (the Pydantic protocol), `config`, `cli`, `adapter`, `registry`, `hardware`, `threads`, `protocol_schema`, `errors`, `retry`, `timing`, `progress`, `execution`, `runner`, `client`, `uploads`, `media/` for FFmpeg-based preparation, and `adapters/whisperx/` for the built-in adapter.

## Naming and structure

- Files and folders are kebab-case. Svelte components are `PascalCase.svelte` and rune modules are `*.svelte.ts`.
- Do not repeat the folder name in the file name: `media/finalize.ts`, not `media/media-finalize.ts`.
- No barrel files. Import from the module that defines the symbol.
- Web tests sit next to their module. Use `*.test.ts` for unit tests and `*.db.test.ts` for tests that need real PostgreSQL. Worker tests live in `workers/inference/tests/` as `test_*.py`, and the test-only fake adapter is `tests/fakes.py`.
- Use `T[]`, not `Array<T>`, and `type` over `interface`.
- Names say what something is. No cryptic abbreviations.

## Comments and file length

Comment only what the code cannot say: a hidden invariant, a non-obvious reason, an external constraint. Do not restate a name, describe an obvious body, or point at callers. Express intent through names, types, and structure.

Keep files under 500 lines and split a module before it gets there. Keep dependencies minimal, validate user input, and never commit secrets.

## Toolchain

Everything runs in containers, so none of these need to be on your host. Each version is declared once:

| Tool       | Version | Declared in                                                          |
| ---------- | ------- | -------------------------------------------------------------------- |
| Node       | 24.6.0  | `.node-version`, `FROM` in `apps/web/Dockerfile`                     |
| pnpm       | 11.15.0 | `packageManager` in `package.json`                                   |
| Python     | 3.12.11 | `workers/inference/.python-version`, `FROM` in the worker Dockerfile |
| uv         | 0.11.25 | `FROM ghcr.io/astral-sh/uv` in the worker Dockerfile, `ci.yml`       |
| PostgreSQL | 17.5    | `compose.yaml`, `ci.yml`                                             |

Image tags stay literal in the Dockerfiles and Compose files so Dependabot can update them. A test fails when they drift from the version files.

## Development stack

```sh
make          # list targets
make dev      # start the stack with the source mounted
make down     # stop it and keep its data
```

`make dev` runs the Compose project `anysub-dev` on `http://localhost:5174`. Set `ANYSUB_DEV_PORT` in `.env` to change the port. Sign-in follows it. The project has its own database, app data, model cache, and `node_modules` volumes, so it never touches a production `anysub` stack on port 5173. Run `./scripts/init-env.sh` first if `.env` does not exist.

With Podman, add `COMPOSE_ENGINE='podman compose'` to any target and set `PODMAN_COMPOSE_PROVIDER` as described in [docs/INSTALL.md](docs/INSTALL.md#podman). `make -n <target>` prints the commands a target would run.

For a single command in a throwaway container:

```sh
docker compose -f compose.yaml -f compose.dev.yaml -p anysub-dev run --rm --no-deps worker uv run pytest tests/test_retry.py
```

The development worker installs the `speech` and `cpu` extras on start. After changing worker dependencies, rebuild it with `docker compose -f compose.yaml -f compose.dev.yaml -p anysub-dev up -d --build worker`.

## Checks

Run this before you push:

```sh
make verify
```

It runs `check`, `test`, `test-db`, `lint`, `format-check`, and `build`:

- `check`: svelte-check and `tsc` for the web app and contracts, and pyright for the worker.
- `test`: Vitest and pytest, including the contract drift checks.
- `test-db`: the web database tests.
- `lint`: ruff on the worker.
- `format-check`: Prettier for the repository, and `ruff format --check` for the worker.
- `build`: the production web bundle.

CI runs the same checks with a frozen lockfile. It adds one job that builds both production images without pushing them. No `make` target builds production images, so a Dockerfile change is only fully checked in CI.

## Contracts

The Pydantic models in `workers/inference/src/anysub_worker/models.py` are the source of truth for the worker protocol. After changing them:

```sh
make generate
```

This writes `packages/contracts/schema/protocol.schema.json`, then the TypeScript types and validators in `packages/contracts/src/generated`. Commit the schema and the generated files together with the model change. The drift tests fail when they disagree with the models. Never edit generated files. Change the models or the generator in `packages/contracts/scripts/generate.mjs` instead.

## Test database

`make test-db` starts the dev PostgreSQL, creates a database named `anysub_test`, runs `pnpm --filter @anysub/web test:db` against it, and drops it afterwards.

The database tests reclaim every expired lease and sweep every media-less project, so they must never see real data. The suite refuses to start unless `ANYSUB_TEST_DATABASE_URL` names a database called `anysub_test` or `anysub_test_<suffix>`, with no query string. If you run `test:db` yourself, point the variable at a disposable database that matches.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org): a short single-line message with a type prefix such as `feat`, `fix`, `docs`, `chore`, `build`, `ci`, or `test`. Keep one concern per commit. Update the documentation in the same change as any user-facing behaviour.
