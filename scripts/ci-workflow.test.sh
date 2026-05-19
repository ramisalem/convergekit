#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${ROOT_DIR}/.github/workflows/ci.yml"

failures=0

assert_file_contains() {
  local pattern="$1"
  local message="$2"

  if ! rg -Fq -- "${pattern}" "${WORKFLOW}"; then
    printf 'FAIL: %s\n  pattern: %s\n' "${message}" "${pattern}" >&2
    failures=$((failures + 1))
  fi
}

assert_file_contains 'image: pgvector/pgvector:pg16' \
  'workflow provides PostgreSQL with pgvector for integration tests'
assert_file_contains 'image: redis:7-alpine' \
  'workflow provides Redis for queue-backed tests'
assert_file_contains 'ACCESS_ALLOWED_EMAIL_DOMAIN: ""' \
  'workflow leaves email-domain access policy unrestricted by default'
assert_file_contains 'ACCESS_ALLOWED_GITHUB_ORG: ""' \
  'workflow leaves GitHub-org access policy unrestricted by default'
assert_file_contains 'WORKFORCE_SAML_SP_ENTITY_ID: urn:convergekit:ci' \
  'workflow uses the public SAML service-provider entity identifier'
assert_file_contains 'bash scripts/opensource-sanitization.test.sh' \
  'workflow runs the public identity guard'
assert_file_contains 'bash scripts/package-scope.test.sh' \
  'workflow runs the package scope guard'
assert_file_contains 'run: pnpm turbo test' \
  'workflow runs the workspace test suite'
assert_file_contains 'run: pnpm turbo typecheck' \
  'workflow runs TypeScript type checks'
assert_file_contains 'run: pnpm turbo lint' \
  'workflow runs lint checks'
assert_file_contains 'run: pnpm turbo build' \
  'workflow runs production builds'

if (( failures > 0 )); then
  printf '\n%d test(s) failed\n' "${failures}" >&2
  exit 1
fi

printf 'CI workflow contract tests passed\n'
