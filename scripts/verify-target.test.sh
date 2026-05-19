#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAKEFILE="${ROOT_DIR}/Makefile"

failures=0

assert_file_contains() {
  local pattern="$1"
  local message="$2"

  if ! rg -Fq "${pattern}" "${MAKEFILE}"; then
    printf 'FAIL: %s\n  pattern: %s\n' "${message}" "${pattern}" >&2
    failures=$((failures + 1))
  fi
}

assert_file_contains 'bash scripts/local-env-parity.test.sh' \
  'verify runs local environment parity checks'
assert_file_contains 'bash scripts/opensource-sanitization.test.sh' \
  'verify checks for stale private product identity'
assert_file_contains 'bash scripts/package-scope.test.sh' \
  'verify checks the public workspace package scope'
assert_file_contains 'pnpm turbo test' \
  'verify runs the workspace test suite'
assert_file_contains 'pnpm turbo typecheck' \
  'verify runs TypeScript type checks'
assert_file_contains 'pnpm turbo lint' \
  'verify runs lint checks'
assert_file_contains 'pnpm turbo build' \
  'verify runs production builds'
assert_file_contains 'git diff --check HEAD' \
  'verify checks whitespace before publishing'

if (( failures > 0 )); then
  printf '\n%d test(s) failed\n' "${failures}" >&2
  exit 1
fi

printf 'Make verify contract tests passed\n'
