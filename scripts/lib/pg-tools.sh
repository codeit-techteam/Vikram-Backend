#!/usr/bin/env bash
# PostgreSQL client helpers — prefer PG 16 (matches DigitalOcean managed Postgres 16).
# Homebrew libpq 17/18 adds GUCs like transaction_timeout that PG 16 rejects on restore.

PG16_IMAGE="${PG16_IMAGE:-postgres:16-alpine}"

ensure_pg_tools() {
  if command -v psql >/dev/null 2>&1; then
    return 0
  fi

  local dir
  for dir in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
    if [[ -x "${dir}/psql" ]]; then
      export PATH="${dir}:${PATH}"
      return 0
    fi
  done

  return 1
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

local_postgres_container() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'bajriwala-postgres'; then
    echo 'bajriwala-postgres'
    return 0
  fi
  return 1
}

is_local_database_url() {
  local url="$1"
  [[ "${url}" == *"@localhost:"* || "${url}" == *"@127.0.0.1:"* ]]
}

sanitize_pg_url() {
  local url="$1"
  url="$(echo "${url}" | sed -E 's/[?&]schema=[^&]*//g; s/\?&/?/g; s/[?&]$//')"
  echo "${url}"
}

host_pg_major_version() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "0"
    return
  fi
  pg_dump --version | sed -E 's/.*PostgreSQL\) ([0-9]+).*/\1/'
}

should_use_pg16_docker() {
  local major
  major="$(host_pg_major_version)"
  [[ "${major}" -gt 16 ]] || ! command -v pg_restore >/dev/null 2>&1
}

pg_dump_url() {
  local url="$1"
  local output_file="$2"
  url="$(sanitize_pg_url "${url}")"

  local container
  if is_local_database_url "${url}" && container="$(local_postgres_container)"; then
    echo "Using docker exec (${container}, PG 16) for pg_dump..."
    docker exec "${container}" pg_dump -U bajriwala -d bajriwala -Fc > "${output_file}"
    return
  fi

  if docker_available && should_use_pg16_docker; then
    echo "Using ${PG16_IMAGE} for pg_dump (PG 16 compatible)..."
    local abs_dir abs_file
    abs_dir="$(cd "$(dirname "${output_file}")" && pwd)"
    abs_file="$(basename "${output_file}")"
    docker run --rm \
      -v "${abs_dir}:/backups" \
      "${PG16_IMAGE}" \
      pg_dump -Fc -f "/backups/${abs_file}" "${url}"
    return
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump -Fc -f "${output_file}" "${url}"
    return
  fi

  echo "PostgreSQL client tools not found."
  echo "Install with: brew install libpq  OR  docker compose up -d postgres"
  exit 1
}

pg_restore_url() {
  local url="$1"
  local dump_file="$2"
  url="$(sanitize_pg_url "${url}")"

  if [[ ! -f "${dump_file}" ]]; then
    echo "Dump file not found: ${dump_file}"
    exit 1
  fi

  if docker_available && should_use_pg16_docker; then
    echo "Using ${PG16_IMAGE} for pg_restore (PG 16 compatible)..."
    local abs_dir abs_file
    abs_dir="$(cd "$(dirname "${dump_file}")" && pwd)"
    abs_file="$(basename "${dump_file}")"
    docker run --rm \
      -v "${abs_dir}:/backups:ro" \
      "${PG16_IMAGE}" \
      pg_restore --clean --if-exists --no-owner --no-acl \
      -d "${url}" "/backups/${abs_file}"
    return
  fi

  if ! command -v pg_restore >/dev/null 2>&1; then
    echo "pg_restore not found. Install: brew install libpq"
    exit 1
  fi

  pg_restore --clean --if-exists --no-owner --no-acl -d "${url}" "${dump_file}"
}

wait_for_do_database() {
  local url="$1"
  local max_attempts="${2:-36}"
  local attempt=1
  local public_ip

  if ! ensure_pg_tools; then
    echo "psql not found — install libpq or use docker."
    return 1
  fi

  url="$(sanitize_pg_url "${url}")"
  public_ip="$(curl -s --max-time 5 ifconfig.me 2>/dev/null || true)"
  public_ip="${public_ip:-unknown}"

  echo ""
  echo "Checking DigitalOcean database connectivity..."
  if PGCONNECT_TIMEOUT=5 psql "${url}" -c "SELECT 1" >/dev/null 2>&1; then
    echo "Connected."
    return 0
  fi

  echo ""
  echo "Cannot reach the managed database (Trusted Sources)."
  echo "  Your IP: ${public_ip}"
  echo "  Where:   DigitalOcean → Databases → db-pgsql-blr1-63888 → Network Access"
  echo ""
  echo "Waiting up to $((max_attempts * 10))s..."

  while (( attempt <= max_attempts )); do
    if PGCONNECT_TIMEOUT=5 psql "${url}" -c "SELECT 1" >/dev/null 2>&1; then
      echo "Connected after ${attempt} attempt(s)."
      return 0
    fi
    printf '.'
    sleep 10
    ((attempt++)) || true
  done

  echo ""
  echo "Timed out."
  return 1
}
