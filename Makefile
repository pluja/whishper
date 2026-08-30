# Thin wrappers around the development commands. Every recipe is a single
# documented command, so `make -n <target>` shows exactly what will run.

COMPOSE := docker compose -f compose.yaml -f compose.dev.yaml

.DEFAULT_GOAL := help
.PHONY: help dev down check test lint verify

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z][a-z-]*:.*## / {printf "  %-7s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the development stack
	$(COMPOSE) up --build

down: ## Stop the stack, keeping all data
	$(COMPOSE) down

check: ## Type-check the web application
	$(COMPOSE) run --rm web pnpm check

test: ## Run the web and worker test suites
	$(COMPOSE) run --rm web pnpm test
	$(COMPOSE) run --rm worker uv run pytest

lint: ## Check formatting and lint the worker
	$(COMPOSE) run --rm web pnpm format:check
	$(COMPOSE) run --rm worker uv run ruff check .

verify: check test lint ## Run everything CI runs, before you push
