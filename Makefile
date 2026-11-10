# Thin wrappers around the development commands. Every recipe is a few
# documented commands, so `make -n <target>` shows exactly what will run.
# Production images build in CI only, so no target here builds them. Compose
# builds the dev images on `make dev`.

COMPOSE_ENGINE ?= docker compose
# The dev project name keeps its network and volumes apart from production.
COMPOSE := $(COMPOSE_ENGINE) -f compose.yaml -f compose.dev.yaml -p anysub-dev
# Every test opens its own in-memory SQLite database, so one-off commands need
# no other service running.
RUN := $(COMPOSE) run --rm --no-deps
# The worker checks run like CI, without the speech and accelerator extras, in
# a venv of their own so the dev worker's venv keeps its extras.
WORKER_CHECK := $(RUN) -e UV_PROJECT_ENVIRONMENT=/check-venv worker uv run --locked --exact

.DEFAULT_GOAL := help
.PHONY: help dev down generate db-generate check test lint format-check build verify ui-check

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z][a-z-]*:.*## / {printf "  %-13s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the development stack
	$(COMPOSE) up --build

down: ## Stop the stack, keeping all data
	$(COMPOSE) down

generate: ## Regenerate the protocol schema and TypeScript contracts from the worker models
	$(RUN) worker uv run anysub-protocol-schema ../../packages/contracts/schema/protocol.schema.json
	$(RUN) web pnpm --filter @anysub/contracts generate

db-generate: ## Generate a database migration from the Drizzle schema (ARGS="--custom --name=x" for a data migration)
	$(RUN) web pnpm --filter @anysub/web db:generate $(ARGS)

check: ## Type-check the web application and contracts (svelte-check, tsc) and the worker (pyright)
	$(RUN) web pnpm check
	$(WORKER_CHECK) pyright

test: ## Run the web and worker test suites, including the contract and migration drift checks
	$(RUN) web pnpm test
	$(WORKER_CHECK) pytest

lint: ## Lint the worker with ruff
	$(WORKER_CHECK) ruff check .

format-check: ## Check formatting of the repository files and the worker
	$(RUN) web pnpm format:check
	$(WORKER_CHECK) ruff format --check .

build: ## Build the production web bundle
	$(RUN) web pnpm build

verify: check test lint format-check build ## Run the web and worker checks CI runs, before you push

ui-check: ## Screenshot every screen in light and dark and run accessibility checks (needs make dev running)
	mkdir -p ui-check-output
	$(COMPOSE) --profile ui run --rm ui-check
