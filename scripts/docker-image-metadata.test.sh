#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

failures=0

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"

  if ! rg -q "${pattern}" "${file}"; then
    printf 'FAIL: %s\n  file: %s\n  pattern: %s\n' "${message}" "${file}" "${pattern}" >&2
    failures=$((failures + 1))
  fi
}

for dockerfile in \
  "${ROOT_DIR}/apps/api/Dockerfile" \
  "${ROOT_DIR}/apps/web/Dockerfile" \
  "${ROOT_DIR}/apps/worker/Dockerfile" \
  "${ROOT_DIR}/packages/db/Dockerfile"; do
  assert_file_contains "${dockerfile}" 'ARG IMAGE_BUILD_CACHE_BUST' "${dockerfile} declares image cache-bust arg"
  assert_file_contains "${dockerfile}" 'dev.convergekit.image-build-cache-bust' "${dockerfile} writes cache-bust label"
done

if (( failures > 0 )); then
  printf '\n%d test(s) failed\n' "${failures}" >&2
  exit 1
fi

printf 'All Docker image metadata tests passed\n'
