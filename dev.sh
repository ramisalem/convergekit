#!/usr/bin/env bash
# dev.sh — start / stop / restart / status the ConvergeKit dev stack
#
# Usage:
#   ./dev.sh start    — start API, worker, and web
#   ./dev.sh stop     — stop all three services
#   ./dev.sh restart  — stop then start
#   ./dev.sh status   — show running / stopped state per service

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$REPO_ROOT/.pids"
LOG_DIR="/tmp/convergekit-logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── Service definitions ──────────────────────────────────────────────────────
# Each entry: NAME|WORK_DIR|CMD
SERVICES=(
  "api|$REPO_ROOT/apps/api|node_modules/.bin/tsx watch --env-file=.env src/index.ts"
  "worker|$REPO_ROOT/apps/worker|node_modules/.bin/tsx watch --env-file=.env src/index.ts"
  "web|$REPO_ROOT/apps/web|node_modules/.bin/next dev --port 4000"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

pid_file() { echo "$PID_DIR/$1.pid"; }
log_file()  { echo "$LOG_DIR/convergekit-$1.log"; }
screen_session() { echo "convergekit-$1"; }

shell_quote() {
  printf '%q' "$1"
}

is_running() {
  local name="$1"
  local pf; pf="$(pid_file "$name")"
  [[ -f "$pf" ]] && kill -0 "$(tr -dc '0-9' < "$pf")" 2>/dev/null
}

collect_descendants() {
  local parent="$1"
  local child

  pgrep -P "$parent" 2>/dev/null | while read -r child; do
    [[ -n "$child" ]] || continue
    printf '%s\n' "$child"
    collect_descendants "$child"
  done
  return 0
}

terminate_process_tree() {
  local root_pid="$1"
  local grace_seconds="${2:-5}"
  local pid
  local descendants

  descendants="$(collect_descendants "$root_pid" | awk 'NF' | sort -rn)"

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done <<< "$descendants"

  kill "$root_pid" 2>/dev/null || true

  local i=0
  local max_checks=$((grace_seconds * 2))
  while kill -0 "$root_pid" 2>/dev/null && (( i < max_checks )); do
    sleep 0.5
    i=$((i + 1))
  done

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
  done <<< "$descendants"

  if kill -0 "$root_pid" 2>/dev/null; then
    kill -9 "$root_pid" 2>/dev/null || true
  fi
}

start_service() {
  local name="$1" workdir="$2" cmd="$3"
  local pf; pf="$(pid_file "$name")"
  local lf; lf="$(log_file "$name")"
  local session; session="$(screen_session "$name")"

  if is_running "$name"; then
    echo "  [$name] already running (PID $(cat "$pf"))"
    return
  fi

  if command -v screen >/dev/null 2>&1; then
    local existing_screen_pid
    existing_screen_pid="$(
      screen -ls 2>/dev/null | awk -v session=".${session}" '$1 ~ session "$" { split($1, parts, "."); print parts[1]; exit }' || true
    )"
    if [[ -n "$existing_screen_pid" ]] && kill -0 "$existing_screen_pid" 2>/dev/null; then
      echo "  [$name] stopping stale screen session $session (PID $existing_screen_pid)..."
      terminate_process_tree "$existing_screen_pid" 5
      screen -wipe >/dev/null 2>&1 || true
    fi
  fi

  echo "  [$name] starting…"
  if command -v screen >/dev/null 2>&1; then
    screen -dmS "$session" bash -lc "cd $(shell_quote "$workdir") && exec $cmd >> $(shell_quote "$lf") 2>&1"
    sleep 0.2
    local screen_pid
    screen_pid="$(
      screen -ls 2>/dev/null | awk -v session=".${session}" '$1 ~ session "$" { split($1, parts, "."); print parts[1]; exit }' || true
    )"
    if [[ -z "$screen_pid" ]]; then
      echo "  [$name] failed to start screen session $session"
      return 1
    fi
    echo "$screen_pid" > "$pf"
    echo "  [$name] PID $screen_pid — logs: $lf"
  else
    # shellcheck disable=SC2086
    (cd "$workdir" && exec nohup bash -lc "exec $cmd" >> "$lf" 2>&1) &
    echo $! > "$pf"
    echo "  [$name] PID $! — logs: $lf"
  fi
}

stop_service() {
  local name="$1"
  local pf; pf="$(pid_file "$name")"

  if ! is_running "$name"; then
    echo "  [$name] not running"
    rm -f "$pf"
    return
  fi

  local pid; pid="$(tr -dc '0-9' < "$pf")"
  echo "  [$name] stopping PID $pid..."
  terminate_process_tree "$pid" 5
  screen -wipe >/dev/null 2>&1 || true

  rm -f "$pf"
  echo "  [$name] stopped"
}

status_service() {
  local name="$1"
  local pf; pf="$(pid_file "$name")"

  if is_running "$name"; then
    printf "  %-8s \033[32mrunning\033[0m  PID %s\n" "[$name]" "$(tr -dc '0-9' < "$pf")"
  else
    printf "  %-8s \033[31mstopped\033[0m\n" "[$name]"
    rm -f "$pf"
  fi
}

# ─── Commands ─────────────────────────────────────────────────────────────────

cmd_start() {
  echo "Starting ConvergeKit dev stack…"
  for svc in "${SERVICES[@]}"; do
    IFS='|' read -r name workdir cmd <<< "$svc"
    start_service "$name" "$workdir" "$cmd"
  done
  echo ""
  echo "Ports:  web → http://localhost:4000   api → http://localhost:4001"
  echo "Logs:   tail -f $LOG_DIR/convergekit-*.log"
}

cmd_stop() {
  echo "Stopping ConvergeKit dev stack…"
  # Stop in reverse order
  for (( i=${#SERVICES[@]}-1; i>=0; i-- )); do
    IFS='|' read -r name workdir cmd <<< "${SERVICES[$i]}"
    stop_service "$name"
  done
  echo "Done."
}

cmd_status() {
  echo "ConvergeKit service status:"
  for svc in "${SERVICES[@]}"; do
    IFS='|' read -r name workdir cmd <<< "$svc"
    status_service "$name"
  done
}

# ─── Entrypoint ───────────────────────────────────────────────────────────────

if [[ "${DEV_SH_SKIP_MAIN:-0}" != "1" ]]; then
  case "${1:-}" in
    start)   cmd_start   ;;
    stop)    cmd_stop    ;;
    restart) cmd_stop; echo ""; cmd_start ;;
    status)  cmd_status  ;;
    *)
      echo "Usage: $0 {start|stop|restart|status}"
      exit 1
      ;;
  esac
fi
