#!/usr/bin/env bash
# dev.sh - manage the ConvergeKit hot-reload Docker Compose dev stack.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
COMPOSE_LOCAL_FILE="${COMPOSE_LOCAL_FILE:-compose.local.yaml}"
COMPOSE_DEV_FILE="${COMPOSE_DEV_FILE:-compose.dev.yaml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-convergekit}"
export COMPOSE_PROJECT_NAME

compose_cmd() {
  docker compose \
    -f "${REPO_ROOT}/${COMPOSE_FILE}" \
    -f "${REPO_ROOT}/${COMPOSE_LOCAL_FILE}" \
    -f "${REPO_ROOT}/${COMPOSE_DEV_FILE}" \
    "$@"
}

cmd_start() {
  echo "Starting ConvergeKit Docker Compose dev stack..."
  compose_cmd up -d --build --wait
  echo ""
  echo "ConvergeKit is available at:"
  echo "  https://convergekit-dev.local"
  echo ""
  echo "Logs:"
  echo "  ./dev.sh logs"
}

cmd_stop() {
  echo "Stopping ConvergeKit Docker Compose dev stack..."
  compose_cmd down
}

cmd_restart() {
  cmd_stop
  echo ""
  cmd_start
}

cmd_status() {
  compose_cmd ps
}

cmd_logs() {
  compose_cmd logs -f "$@"
}

cmd_config() {
  compose_cmd config
}

cmd_help() {
  cat <<'EOF'
Usage: ./dev.sh {start|stop|restart|status|logs|config}

Commands:
  start    Start PostgreSQL, Redis, API, worker, web, and local HTTPS proxy
  stop     Stop the full ConvergeKit dev stack
  restart  Stop and start the full ConvergeKit dev stack
  status   Show Docker Compose service status
  logs     Tail Docker Compose logs; accepts optional service names
  config   Print the merged Docker Compose config
EOF
}

if [[ "${DEV_SH_SKIP_MAIN:-0}" != "1" ]]; then
  case "${1:-}" in
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    restart)
      cmd_restart
      ;;
    status)
      cmd_status
      ;;
    logs)
      shift
      cmd_logs "$@"
      ;;
    config)
      cmd_config
      ;;
    help|-h|--help)
      cmd_help
      ;;
    *)
      cmd_help
      exit 1
      ;;
  esac
fi
