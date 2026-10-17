# Thin wrappers around the development commands. Every recipe is a few
# documented commands, so `make -n <target>` shows exactly what will run.
# Production images build in CI only, so no target here builds them. Compose
# builds the dev images on `make dev`.

COMPOSE_ENGINE ?= docker compose
# The dev project name keeps its network and volumes apart from production.
COMPOSE := $(COMPOSE_ENGINE) -f compose.yaml -f compose.dev.yaml -p anysub-dev
# The unit suites use fake database clients, so one-off commands skip postgres
# and migrate. Only test-db starts postgres, and it works in its own database.
RUN := $(COMPOSE) run --rm --no-deps
TEST_DATABASE := anysub_test
psql = $(COMPOSE) exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "$(1)"'

.DEFAULT_GOAL := help
.PHONY: help dev down generate check test test-db lint format-check build verify ui-check

help: ## List available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z][a-z-]*:.*## / {printf "  %-13s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the development stack
	$(COMPOSE) up --build

down: ## Stop the stack, keeping all data
	$(COMPOSE) down

generate: ## Regenerate the protocol schema and TypeScript contracts from the worker models
	$(RUN) worker uv run anysub-protocol-schema ../../packages/contracts/schema/protocol.schema.json
	$(RUN) web pnpm --filter @anysub/contracts generate

check: ## Type-check the web application and contracts (svelte-check, tsc) and the worker (pyright)
	$(RUN) web pnpm check
	$(RUN) worker uv run pyright

test: ## Run the web and worker test suites, including the contract drift checks
	$(RUN) web pnpm test
	$(RUN) worker uv run pytest

test-db: ## Run the web database tests against a throwaway database in the dev postgres
	$(COMPOSE) up --detach --wait postgres
	$(call psql,drop database if exists $(TEST_DATABASE) with (force))
	$(call psql,create database $(TEST_DATABASE))
	$(RUN) web sh -c 'server="$${DATABASE_URL%%\?*}"; ANYSUB_TEST_DATABASE_URL="$${server%/*}/$(TEST_DATABASE)" pnpm --filter @anysub/web test:db'; \
	status=$$?; $(call psql,drop database $(TEST_DATABASE) with (force)); exit $$status

lint: ## Lint the worker with ruff
	$(RUN) worker uv run ruff check .

format-check: ## Check formatting of the repository files and the worker
	$(RUN) web pnpm format:check
	$(RUN) worker uv run ruff format --check .

build: ## Build the production web bundle
	$(RUN) web pnpm build

verify: check test test-db lint format-check build ## Run the web and worker checks CI runs, before you push

ui-check: ## Screenshot every screen in light and dark and run accessibility checks (needs make dev running)
	$(COMPOSE) --profile ui run --rm ui-check
