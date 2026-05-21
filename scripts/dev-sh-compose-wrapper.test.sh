#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
LOG_FILE="${TMP_DIR}/docker.log"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

cat > "${TMP_DIR}/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
printf 'project=%s args=%s\n' "${COMPOSE_PROJECT_NAME:-}" "$*" >> "${DEV_SH_FAKE_DOCKER_LOG}"
FAKE_DOCKER
chmod +x "${TMP_DIR}/docker"

export DEV_SH_FAKE_DOCKER_LOG="${LOG_FILE}"
export DEV_SH_SKIP_MAIN=1
export PATH="${TMP_DIR}:${PATH}"

source "${ROOT_DIR}/dev.sh"

declare -F compose_cmd >/dev/null || fail 'dev.sh should expose compose_cmd for Docker Compose calls'
declare -F cmd_start >/dev/null || fail 'dev.sh should expose cmd_start'
declare -F cmd_stop >/dev/null || fail 'dev.sh should expose cmd_stop'
declare -F cmd_status >/dev/null || fail 'dev.sh should expose cmd_status'
declare -F cmd_logs >/dev/null || fail 'dev.sh should expose cmd_logs'

cmd_start >/dev/null
grep -Fq "project=convergekit args=compose -f ${ROOT_DIR}/compose.yaml -f ${ROOT_DIR}/compose.local.yaml -f ${ROOT_DIR}/compose.dev.yaml up -d --build --wait" "${LOG_FILE}" \
  || fail 'cmd_start should launch the hot-reload Compose stack in detached mode'

: > "${LOG_FILE}"
cmd_stop >/dev/null
grep -Fq "project=convergekit args=compose -f ${ROOT_DIR}/compose.yaml -f ${ROOT_DIR}/compose.local.yaml -f ${ROOT_DIR}/compose.dev.yaml down" "${LOG_FILE}" \
  || fail 'cmd_stop should stop the hot-reload Compose stack'

: > "${LOG_FILE}"
cmd_status >/dev/null
grep -Fq "project=convergekit args=compose -f ${ROOT_DIR}/compose.yaml -f ${ROOT_DIR}/compose.local.yaml -f ${ROOT_DIR}/compose.dev.yaml ps" "${LOG_FILE}" \
  || fail 'cmd_status should show the hot-reload Compose stack status'

: > "${LOG_FILE}"
cmd_logs api >/dev/null
grep -Fq "project=convergekit args=compose -f ${ROOT_DIR}/compose.yaml -f ${ROOT_DIR}/compose.local.yaml -f ${ROOT_DIR}/compose.dev.yaml logs -f api" "${LOG_FILE}" \
  || fail 'cmd_logs should tail Compose logs and pass through service names'

printf 'PASS: dev.sh wraps the hot-reload Docker Compose stack.\n'
