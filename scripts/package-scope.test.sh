#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

legacy_scope='@ji''sr'

if rg -n "${legacy_scope}/|${legacy_scope}\"" apps packages package.json pnpm-lock.yaml CLAUDE.md README.md; then
  printf 'FAIL: %s package scope remains.\n' "${legacy_scope}" >&2
  exit 1
fi

if ! rg -n '"name": "@convergekit/' apps packages >/dev/null; then
  printf 'FAIL: no @convergekit package manifests found.\n' >&2
  exit 1
fi

printf 'PASS: workspace package scope is @convergekit.\n'
