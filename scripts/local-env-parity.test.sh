#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAKEFILE="${ROOT_DIR}/Makefile"
COMPOSE_LOCAL="${ROOT_DIR}/compose.local.yaml"
DOCKERIGNORE="${ROOT_DIR}/.dockerignore"
CI_WORKFLOW="${ROOT_DIR}/.github/workflows/ci.yml"
CONFIG_ENV="${ROOT_DIR}/packages/config/src/env.ts"
AI_MODELS="${ROOT_DIR}/packages/ai/src/models.ts"
LOCAL_DB_SCRIPT="${ROOT_DIR}/scripts/prepare-local-db.sh"
SMOKE_SCRIPT="${ROOT_DIR}/scripts/smoke-local.sh"
DEV_SH_CONTRACT="${ROOT_DIR}/scripts/dev-sh-compose-wrapper.test.sh"

failures=0

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"

  if ! grep -Fq -- "${pattern}" "${file}"; then
    printf 'FAIL: %s\n  file: %s\n  pattern: %s\n' "${message}" "${file}" "${pattern}" >&2
    failures=$((failures + 1))
  fi
}

assert_file_exists() {
  local file="$1"
  local message="$2"

  if [[ ! -f "${file}" ]]; then
    printf 'FAIL: %s\n  file: %s\n' "${message}" "${file}" >&2
    failures=$((failures + 1))
  fi
}

assert_file_contains "${MAKEFILE}" 'COMPOSE_PROJECT_NAME ?= convergekit' \
  'Makefile uses the public Compose project name'
assert_file_contains "${MAKEFILE}" 'docker compose -f $(COMPOSE_FILE)' \
  'Makefile Docker commands use the pinned compose file'
assert_file_contains "${MAKEFILE}" 'dev: ## Start the full hot-reload Docker Compose dev stack' \
  'Makefile dev target is the compose-first local development path'
assert_file_contains "${MAKEFILE}" './dev.sh start' \
  'Makefile dev target delegates to the compose wrapper'
assert_file_contains "${MAKEFILE}" 'bash scripts/opensource-sanitization.test.sh' \
  'verify runs the public identity guard'
assert_file_contains "${MAKEFILE}" 'bash scripts/package-scope.test.sh' \
  'verify runs the package scope guard'
assert_file_contains "${MAKEFILE}" 'bash scripts/local-env-parity.test.sh' \
  'verify runs the local environment parity contract'
assert_file_contains "${MAKEFILE}" 'bash scripts/ci-workflow.test.sh' \
  'verify runs the public CI contract'
assert_file_contains "${MAKEFILE}" 'bash scripts/dev-sh-compose-wrapper.test.sh' \
  'verify runs the compose-first dev.sh contract'
assert_file_contains "${MAKEFILE}" 'bash scripts/local-compose-config.test.sh' \
  'verify validates Compose config files'
assert_file_contains "${MAKEFILE}" 'pnpm turbo test' \
  'verify runs the workspace test suite'
assert_file_contains "${MAKEFILE}" 'pnpm turbo typecheck' \
  'verify runs TypeScript type checks'
assert_file_contains "${MAKEFILE}" 'pnpm turbo lint' \
  'verify runs lint checks'
assert_file_contains "${MAKEFILE}" 'pnpm turbo build' \
  'verify runs production builds'
assert_file_contains "${MAKEFILE}" 'git diff --check HEAD' \
  'verify checks whitespace before publishing'

assert_file_contains "${DOCKERIGNORE}" '**/.env' \
  'Docker build context excludes nested local env files'
assert_file_contains "${DOCKERIGNORE}" '**/.env.*' \
  'Docker build context excludes nested local env variants'

assert_file_contains "${COMPOSE_LOCAL}" 'GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:-convergekit-local-github-client-id}' \
  'local Compose stack provides a non-empty dummy GitHub OAuth client id'
assert_file_contains "${COMPOSE_LOCAL}" 'GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:-convergekit-local-github-client-secret}' \
  'local Compose stack provides a non-empty dummy GitHub OAuth client secret'
assert_file_contains "${COMPOSE_LOCAL}" 'CONVERGEKIT_DNS_PRIMARY:-1.1.1.1' \
  'local Compose stack pins an overridable DNS fallback for OAuth/API egress'
assert_file_contains "${COMPOSE_LOCAL}" 'dns: *convergekit-node-dns' \
  'local Compose Node services use the shared DNS fallback'
assert_file_contains "${COMPOSE_LOCAL}" 'BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:-change-me-to-a-random-32-char-string}' \
  'local Compose API and worker share the encryption secret used for AI settings'

assert_file_exists "${LOCAL_DB_SCRIPT}" 'local DB preparation script exists'
assert_file_contains "${LOCAL_DB_SCRIPT}" 'POSTGRES_USER="${POSTGRES_USER:-convergekit}"' \
  'local DB preparation script uses the public database user'
assert_file_contains "${LOCAL_DB_SCRIPT}" 'POSTGRES_DB="${POSTGRES_DB:-convergekit}"' \
  'local DB preparation script uses the public database name'
assert_file_contains "${LOCAL_DB_SCRIPT}" 'LEGACY_POSTGRES_DB="${LEGACY_POSTGRES_DB:-convergekit_legacy}"' \
  'local DB preparation script has a generic legacy database fallback'
assert_file_contains "${LOCAL_DB_SCRIPT}" 'update_env_file "${ROOT_DIR}/apps/api/.env"' \
  'local DB preparation script updates the ignored API env file in place'
assert_file_contains "${LOCAL_DB_SCRIPT}" 'update_env_file "${ROOT_DIR}/apps/worker/.env"' \
  'local DB preparation script updates the ignored worker env file in place'

assert_file_exists "${ROOT_DIR}/apps/api/.env.example" 'API local env example exists'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'DATABASE_URL=postgresql://convergekit:convergekit_secret@localhost:5432/convergekit' \
  'API local env example uses the public local database'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'BETTER_AUTH_URL=https://convergekit-dev.local' \
  'API local env example uses the local HTTPS auth origin'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'WEB_APP_URL=https://convergekit-dev.local' \
  'API local env example uses the local HTTPS web origin'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'WORKFORCE_SSO_PROVIDER_LABEL=Authentik' \
  'API local env example uses the public SSO label'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'WORKFORCE_SAML_SP_ENTITY_ID=urn:convergekit:dev' \
  'API local env example uses the public SAML entity identifier'
assert_file_contains "${ROOT_DIR}/apps/api/.env.example" 'CONVERGEKIT_SESSION_TTL_DAYS=14' \
  'API local env example uses the public session TTL variable'

assert_file_exists "${ROOT_DIR}/apps/web/.env.local.example" 'web local env example exists'
assert_file_contains "${ROOT_DIR}/apps/web/.env.local.example" 'NEXT_PUBLIC_API_URL=https://convergekit-dev.local' \
  'web local env example points server-side API calls at local HTTPS origin'
assert_file_contains "${ROOT_DIR}/apps/web/.env.local.example" 'NEXT_PUBLIC_WEB_URL=https://convergekit-dev.local' \
  'web local env example points SSR same-origin calls at local HTTPS origin'

assert_file_exists "${ROOT_DIR}/apps/worker/.env.example" 'worker local env example exists'
assert_file_contains "${ROOT_DIR}/apps/worker/.env.example" 'DATABASE_URL=postgresql://convergekit:convergekit_secret@localhost:5432/convergekit' \
  'worker local env example uses the public local database'
assert_file_contains "${ROOT_DIR}/apps/worker/.env.example" 'WORKSPACE_DIR=/tmp/convergekit-workspace' \
  'worker local env example uses the public workspace directory'

assert_file_contains "${ROOT_DIR}/.env.example" 'AI_PROVIDER=openrouter' \
  'root env example defaults to OpenRouter'
assert_file_contains "${CONFIG_ENV}" ".default('openrouter')" \
  'typed env config defaults to OpenRouter'
assert_file_contains "${AI_MODELS}" "if (raw === 'anthropic') return 'anthropic'" \
  'system model resolver still honors explicit Anthropic configuration'
assert_file_contains "${AI_MODELS}" "  return 'openrouter'" \
  'system model resolver defaults to OpenRouter when AI_PROVIDER is unset'

assert_file_exists "${SMOKE_SCRIPT}" 'local smoke script exists'
assert_file_contains "${SMOKE_SCRIPT}" 'WEB_URL="${WEB_URL:-https://convergekit-dev.local}"' \
  'local smoke script defaults to the local HTTPS web origin'
assert_file_contains "${SMOKE_SCRIPT}" 'API_URL="${API_URL:-${WEB_URL}}"' \
  'local smoke script uses the same-origin reverse proxy by default'
assert_file_contains "${SMOKE_SCRIPT}" '/api/auth/sign-in/email' \
  'local smoke script logs in through same-origin web API proxy'

assert_file_exists "${DEV_SH_CONTRACT}" 'dev.sh compose wrapper contract test exists'
assert_file_contains "${ROOT_DIR}/dev.sh" 'docker compose \' \
  'dev.sh shells out to Docker Compose'
assert_file_contains "${ROOT_DIR}/dev.sh" 'cmd_logs()' \
  'dev.sh exposes a logs command for the compose stack'

assert_file_contains "${CI_WORKFLOW}" 'image: pgvector/pgvector:pg16' \
  'CI provides PostgreSQL with pgvector'
assert_file_contains "${CI_WORKFLOW}" 'image: redis:7-alpine' \
  'CI provides Redis'
assert_file_contains "${CI_WORKFLOW}" 'run: pnpm turbo test' \
  'CI runs the workspace test suite'

if (( failures > 0 )); then
  printf '\n%d test(s) failed\n' "${failures}" >&2
  exit 1
fi

printf 'PASS: local environment parity contract is public and current.\n'
