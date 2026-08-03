.PHONY: help dev build lint typecheck clean \
        docker\:up docker\:down docker\:logs \
        compose\:setup-host compose\:prod compose\:dev compose\:down compose\:logs compose\:config \
        db\:prepare-local db\:migrate db\:generate db\:studio \
        worker\:start install test verify smoke\:local

COMPOSE_FILE ?= compose.yaml
COMPOSE_PROJECT_NAME ?= convergekit
DOCKER_COMPOSE ?= docker compose -f $(COMPOSE_FILE)
COMPOSE_LOCAL_FILE ?= compose.local.yaml
COMPOSE_DEV_FILE ?= compose.dev.yaml
DOCKER_COMPOSE_LOCAL ?= docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_LOCAL_FILE)
DOCKER_COMPOSE_DEV ?= docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_LOCAL_FILE) -f $(COMPOSE_DEV_FILE)
export COMPOSE_PROJECT_NAME

-include apps/api/.env
export DATABASE_URL

# Default target: show available commands
help:
	@echo "Colab Ai Hub — available targets:"
	@echo ""
	@echo "  Development"
	@echo "    make dev           Start the full hot-reload Docker Compose dev stack"
	@echo "    make install       Install all pnpm dependencies"
	@echo ""
	@echo "  Code quality"
	@echo "    make build         Build all apps and packages via Turborepo"
	@echo "    make lint          Run ESLint across all packages"
	@echo "    make test          Run tests across all packages"
	@echo "    make typecheck     Run TypeScript type checking across all packages"
	@echo "    make verify        Run the local pre-PR verification gate"
	@echo "    make clean         Remove all build outputs and node_modules"
	@echo ""
	@echo "  Infrastructure"
	@echo "    make docker:up     Start PostgreSQL (pgvector) + Redis via Docker Compose"
	@echo "    make docker:down   Stop and remove Docker Compose services"
	@echo "    make docker:logs   Tail logs from all Compose services"
	@echo "    make compose:setup-host  Add convergekit-dev.local + local TLS certs"
	@echo "    make compose:prod        Start production-like local stack behind HTTPS proxy"
	@echo "    make compose:dev         Start hot-reload local stack behind HTTPS proxy"
	@echo "    make compose:down        Stop the full local Compose stack"
	@echo "    make compose:logs        Tail full local Compose stack logs"
	@echo ""
	@echo "  Database"
	@echo "    make db:prepare-local  Preserve/rename legacy local DB into the canonical DB"
	@echo "    make db:generate   Generate Drizzle migration files from schema changes"
	@echo "    make db:migrate    Apply pending Drizzle migrations to the database"
	@echo "    make db:studio     Open Drizzle Studio in the browser"
	@echo ""
	@echo "  Worker"
	@echo "    make worker:start  Start the background worker process standalone"
	@echo ""
	@echo "  Smoke"
	@echo "    make smoke:local   Run local production-shape smoke checks"

# ─── Development ──────────────────────────────────────────────────────────────

install: ## Install all pnpm workspace dependencies
	pnpm install

dev: ## Start the full hot-reload Docker Compose dev stack
	./dev.sh start

# ─── Code quality ─────────────────────────────────────────────────────────────

build: ## Build all apps and packages
	pnpm turbo build

lint: ## Lint all packages
	pnpm turbo lint

test: ## Run tests across all packages
	pnpm turbo test

typecheck: ## Type-check all packages
	pnpm turbo typecheck

verify: ## Run the local pre-PR verification gate
	bash scripts/opensource-sanitization.test.sh
	bash scripts/package-scope.test.sh
	bash scripts/local-env-parity.test.sh
	bash scripts/ci-workflow.test.sh
	bash scripts/dev-sh-compose-wrapper.test.sh
	bash scripts/local-compose-config.test.sh
	pnpm turbo test
	pnpm turbo typecheck
	pnpm turbo lint
	pnpm turbo build
	git diff --check HEAD

clean: ## Remove all build artifacts and node_modules
	pnpm turbo clean
	rm -rf node_modules

# ─── Infrastructure ───────────────────────────────────────────────────────────

docker\:up: ## Start PostgreSQL + Redis (detached)
	$(DOCKER_COMPOSE) up -d --wait

docker\:down: ## Stop and remove Compose services and volumes
	$(DOCKER_COMPOSE) down

docker\:logs: ## Tail all Compose service logs
	$(DOCKER_COMPOSE) logs -f

compose\:setup-host: ## Add convergekit-dev.local and generate local TLS certificates
	bash scripts/setup-local-dev-host.sh

compose\:prod: ## Start production-like app containers behind the local HTTPS proxy
	$(DOCKER_COMPOSE_LOCAL) up -d --build --wait

compose\:dev: ## Start hot-reload app containers behind the local HTTPS proxy
	$(DOCKER_COMPOSE_DEV) up -d --build --wait

compose\:down: ## Stop and remove the full local Compose stack
	$(DOCKER_COMPOSE_DEV) down

compose\:logs: ## Tail logs from the full local Compose stack
	$(DOCKER_COMPOSE_DEV) logs -f

compose\:config: ## Validate base, production-like, and hot-reload Compose configs
	bash scripts/local-compose-config.test.sh

# ─── Database ─────────────────────────────────────────────────────────────────

db\:prepare-local: ## Preserve/rename legacy local DB into the canonical DB
	bash scripts/prepare-local-db.sh

db\:generate: ## Generate Drizzle ORM migration files
	pnpm --filter @convergekit/db db:generate

db\:migrate: ## Apply pending Drizzle migrations
	pnpm --filter @convergekit/db db:migrate

db\:studio: ## Open Drizzle Studio
	pnpm --filter @convergekit/db db:studio

# ─── Worker ───────────────────────────────────────────────────────────────────

worker\:start: ## Start the background worker standalone
	pnpm --filter @convergekit/worker start

# ─── Smoke ────────────────────────────────────────────────────────────────────

smoke\:local: ## Run local production-shape smoke checks
	bash scripts/smoke-local.sh
