# Thin wrappers around the development commands. Every recipe is a few
# documented commands, so `make -n <target>` shows exactly what will run.

COMPOSE_ENGINE ?= docker compose
# The dev project name keeps its network and volumes apart from production.
COMPOSE := $(COMPOSE_ENGINE) -f compose.yaml -f compose.dev.yaml -p anysub-dev
# The unit suites use fake database clients, so one-off commands skip postgres
# and migrate. Only test-db starts postgres, and it works in its own database.
RUN := $(COMPOSE) run --rm --no-deps
TEST_DATABASE := anysub_test
psql = $(COMPOSE) exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "$(1)"'

.DEFAULT_GOAL := help
.PHONY: help dev down generate check test test-db lint build verify

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

test-db: ## Run the web database tests against a throwaway database in the dev postgres
	$(COMPOSE) up --detach --wait postgres
	$(call psql,drop database if exists $(TEST_DATABASE) with (force))
	$(call psql,create database $(TEST_DATABASE))
	$(RUN) web sh -c 'ANYSUB_TEST_DATABASE_URL="$${DATABASE_URL%/*}/$(TEST_DATABASE)" pnpm --filter @anysub/web test:db'; \
	status=$$?; $(call psql,drop database $(TEST_DATABASE) with (force)); exit $$status

lint: ## Check formatting and lint the web and worker
	$(RUN) web pnpm format:check
	$(RUN) worker uv run ruff check .
	$(RUN) worker uv run ruff format --check .

build: ## Build the production web bundle
	$(RUN) web pnpm --filter @anysub/web build

verify: check test test-db lint build ## Run the web and worker checks CI runs, before you push
