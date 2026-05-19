#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT}"

docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.local.yaml config --quiet
docker compose -f compose.yaml -f compose.local.yaml -f compose.dev.yaml config --quiet

printf 'PASS: compose config files are valid.\n'
