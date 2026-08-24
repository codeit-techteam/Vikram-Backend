#!/usr/bin/env bash
# Resolve pg_dump / pg_restore / psql from PATH or Homebrew libpq.
# Falls back to the local Docker Postgres container for localhost dumps.

ensure_pg_tools() {
  if command -v pg_dump >/dev/null 2>&1 \
    && command -v pg_restore >/dev/null 2>&1 \
    && command -v psql >/dev/null 2>&1; then
    return 0
  fi

  local dir
  for dir in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
    if [[ -x "${dir}/pg_dump" && -x "${dir}/pg_restore" && -x "${dir}/psql" ]]; then
      export PATH="${dir}:${PATH}"
      return 0
    fi
  done

  return 1
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

# pg_dump/psql do not accept Prisma-only params like ?schema=public
sanitize_pg_url() {
  local url="$1"
  url="$(echo "${url}" | sed -E 's/[?&]schema=[^&]*//g; s/\?&/?/g; s/[?&]$//')"
  echo "${url}"
}

pg_dump_url() {
  local url="$1"
  local output_file="$2"
  url="$(sanitize_pg_url "${url}")"

  if ensure_pg_tools; then
    pg_dump -Fc -f "${output_file}" "${url}"
    return
  fi

  local container
  if is_local_database_url "${url}" && container="$(local_postgres_container)"; then
    echo "Using docker exec (${container}) for local pg_dump..."
    docker exec "${container}" pg_dump -U bajriwala -d bajriwala -Fc > "${output_file}"
    return
  fi

  echo "PostgreSQL client tools not found."
  echo "Install with: brew install libpq"
  echo "Then run: export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\""
  exit 1
}

wait_for_do_database() {
  local url="$1"
  local max_attempts="${2:-36}"
  local attempt=1
  local public_ip

  public_ip="$(curl -s --max-time 5 ifconfig.me 2>/dev/null || true)"
  public_ip="${public_ip:-unknown}"

  echo ""
  echo "Checking DigitalOcean database connectivity..."
  if PGCONNECT_TIMEOUT=5 psql "${url}" -c "SELECT 1" >/dev/null 2>&1; then
    echo "Connected."
    return 0
  fi

  echo ""
  echo "Cannot reach the managed database from this machine (Trusted Sources)."
  echo "Add YOUR public IP to the DATABASE firewall — not the app egress IPs."
  echo ""
  echo "  Your IP:     ${public_ip}"
  echo "  Where:       DigitalOcean → Databases → db-pgsql-blr1-63888 → Settings → Trusted Sources"
  echo "  Alternative: npm run db:prepare:vpc-restore   (restore via App Platform VPC)"
  echo ""
  echo "Waiting up to $((max_attempts * 10))s for access (add the IP now)..."

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
  echo "Timed out. Use Trusted Sources or VPC restore:"
  echo "  npm run db:prepare:vpc-restore"
  return 1
}

pg_restore_url() {
  local url="$1"
  local dump_file="$2"

  if ! ensure_pg_tools; then
    echo "PostgreSQL client tools not found (pg_restore required)."
    echo "Install with: brew install libpq"
    echo "Then run: export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\""
    exit 1
  fi

  pg_restore --clean --if-exists --no-owner --no-acl -d "$(sanitize_pg_url "${url}")" "${dump_file}"
}
