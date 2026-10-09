# Thin wrappers around the development commands. Every recipe is a single
# documented command, so `make -n <target>` shows exactly what will run.

COMPOSE_ENGINE ?= docker compose
# The dev project name keeps its network and volumes apart from production.
COMPOSE := $(COMPOSE_ENGINE) -f compose.yaml -f compose.dev.yaml -p anysub-dev
# The suites use fake database clients, so one-off commands skip postgres and migrate.
RUN := $(COMPOSE) run --rm --no-deps

.DEFAULT_GOAL := help
.PHONY: help dev down generate check test lint verify

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z][a-z-]*:.*## / {printf "  %-9s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the development stack
	$(COMPOSE) up --build

down: ## Stop the stack, keeping all data
	$(COMPOSE) down

generate: ## Regenerate the protocol schema and TypeScript contracts from the worker models
	$(RUN) worker uv run anysub-protocol-schema
	$(RUN) web pnpm --filter @anysub/contracts generate

check: ## Type-check the web application
	$(RUN) web pnpm check

test: ## Run the web and worker test suites, including the contract drift checks
	$(RUN) web pnpm test
	$(RUN) worker uv run pytest

lint: ## Check formatting and lint the web and worker
	$(RUN) web pnpm format:check
	$(RUN) worker uv run ruff check .
	$(RUN) worker uv run ruff format --check .

verify: check test lint ## Run everything CI runs, before you push
