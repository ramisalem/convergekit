#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DEV_SH_SKIP_MAIN=1 source "${ROOT_DIR}/dev.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

parent_pid=""
child_pid=""

cleanup() {
  if [[ -n "${parent_pid}" ]]; then
    kill "${parent_pid}" 2>/dev/null || true
  fi
  if [[ -n "${child_pid}" ]]; then
    kill "${child_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

bash -c 'sleep 60 & wait' >/dev/null 2>&1 &
parent_pid="$!"
disown "${parent_pid}" 2>/dev/null || true

for _ in {1..20}; do
  child_pid="$(pgrep -P "${parent_pid}" 2>/dev/null | head -n 1 || true)"
  [[ -n "${child_pid}" ]] && break
  sleep 0.1
done

[[ -n "${child_pid}" ]] || fail 'test child process did not start'

descendants="$(collect_descendants "${parent_pid}")"
if [[ " ${descendants} " != *" ${child_pid} "* ]]; then
  fail "collect_descendants did not include child ${child_pid}; got: ${descendants}"
fi

terminate_process_tree "${parent_pid}" 1

if kill -0 "${parent_pid}" 2>/dev/null; then
  fail "parent ${parent_pid} survived terminate_process_tree"
fi

if kill -0 "${child_pid}" 2>/dev/null; then
  fail "child ${child_pid} survived terminate_process_tree"
fi

single_pid=""
bash -c 'sleep 60' >/dev/null 2>&1 &
single_pid="$!"
disown "${single_pid}" 2>/dev/null || true

terminate_process_tree "${single_pid}" 1

if kill -0 "${single_pid}" 2>/dev/null; then
  fail "single process ${single_pid} survived terminate_process_tree"
fi

printf 'PASS: dev.sh process tree helpers terminate descendants.\n'
