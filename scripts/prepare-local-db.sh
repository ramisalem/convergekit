#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
COMPOSE_PATH="${ROOT_DIR}/${COMPOSE_FILE}"

POSTGRES_USER="${POSTGRES_USER:-convergekit}"
POSTGRES_DB="${POSTGRES_DB:-convergekit}"
LEGACY_POSTGRES_DB="${LEGACY_POSTGRES_DB:-convergekit_legacy}"
LOCAL_DB_BACKUP_DIR="${LOCAL_DB_BACKUP_DIR:-${ROOT_DIR}/.local-db-backups}"

if [[ ! -f "${COMPOSE_PATH}" ]]; then
  printf 'Local compose file not found: %s\n' "${COMPOSE_PATH}" >&2
  exit 1
fi

compose() {
  docker compose -f "${COMPOSE_PATH}" "$@"
}

psql_postgres() {
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d postgres "$@"
}

sql_literal() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "'%s'" "${value}"
}

sql_identifier() {
  local value="$1"
  value="${value//\"/\"\"}"
  printf '"%s"' "${value}"
}

database_exists() {
  local db_name="$1"
  local result

  result="$(
    psql_postgres -Atc \
      "select 1 from pg_database where datname = $(sql_literal "${db_name}");"
  )"

  [[ "${result}" == "1" ]]
}

create_database() {
  local db_name="$1"

  psql_postgres -c "CREATE DATABASE $(sql_identifier "${db_name}");"
}

dump_database() {
  local db_name="$1"
  local backup_file="$2"

  mkdir -p "$(dirname "${backup_file}")"
  compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -Fc "${db_name}" > "${backup_file}"
}

restore_database() {
  local db_name="$1"
  local backup_file="$2"

  compose exec -T postgres pg_restore -U "${POSTGRES_USER}" --no-owner -d "${db_name}" < "${backup_file}"
}

terminate_database_connections() {
  local db_name="$1"

  psql_postgres -c \
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $(sql_literal "${db_name}") and pid <> pg_backend_pid();"
}

rename_database() {
  psql_postgres -c \
    "ALTER DATABASE $(sql_identifier "${LEGACY_POSTGRES_DB}") RENAME TO $(sql_identifier "${POSTGRES_DB}");"
}

update_env_file() {
  local env_file="$1"

  if [[ ! -f "${env_file}" ]]; then
    return
  fi

  local tmp_file
  tmp_file="$(mktemp)"

  sed -E \
    -e "s#^(POSTGRES_DB=)${LEGACY_POSTGRES_DB}\$#\\1${POSTGRES_DB}#" \
    -e "s#(postgresql://[^[:space:]]*/)${LEGACY_POSTGRES_DB}([?[:space:]]|\$)#\\1${POSTGRES_DB}\\2#g" \
    "${env_file}" > "${tmp_file}"

  if cmp -s "${env_file}" "${tmp_file}"; then
    rm -f "${tmp_file}"
    return
  fi

  mv "${tmp_file}" "${env_file}"
  printf 'Updated %s to use %s\n' "${env_file#${ROOT_DIR}/}" "${POSTGRES_DB}"
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${LOCAL_DB_BACKUP_DIR}/${LEGACY_POSTGRES_DB}-${timestamp}.dump"

compose up -d --wait postgres

legacy_exists=false
target_exists=false

if database_exists "${LEGACY_POSTGRES_DB}"; then
  legacy_exists=true
fi

if database_exists "${POSTGRES_DB}"; then
  target_exists=true
fi

if [[ "${target_exists}" == "true" ]]; then
  printf 'Canonical local database already exists: %s\n' "${POSTGRES_DB}"
elif [[ "${legacy_exists}" == "true" ]]; then
  printf 'Found legacy local database: %s\n' "${LEGACY_POSTGRES_DB}"
  dump_database "${LEGACY_POSTGRES_DB}" "${backup_file}"
  printf 'Backed up %s to %s\n' "${LEGACY_POSTGRES_DB}" "${backup_file}"

  terminate_database_connections "${LEGACY_POSTGRES_DB}"

  if rename_database; then
    printf 'Renamed %s to %s\n' "${LEGACY_POSTGRES_DB}" "${POSTGRES_DB}"
  else
    printf 'Rename failed; restoring %s into a fresh %s database\n' "${backup_file}" "${POSTGRES_DB}" >&2
    create_database "${POSTGRES_DB}"
    restore_database "${POSTGRES_DB}" "${backup_file}"
  fi
else
  printf 'No local database found; creating %s\n' "${POSTGRES_DB}"
  create_database "${POSTGRES_DB}"
fi

update_env_file "${ROOT_DIR}/.env"
update_env_file "${ROOT_DIR}/apps/api/.env"
update_env_file "${ROOT_DIR}/apps/worker/.env"

printf 'Local database is ready: %s\n' "${POSTGRES_DB}"
