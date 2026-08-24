#!/usr/bin/env bash
# Safe local → DigitalOcean PostgreSQL migration helper.
#
# Usage:
#   export DO_DATABASE_URL='postgresql://...'   # from DO dashboard (Trusted Sources required)
#   npm run db:migrate:local-to-do
#
# Requires pg_dump/pg_restore (brew install libpq) or local Docker postgres for backup.
# Never commit connection strings or passwords.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/pg-tools.sh
source "${ROOT}/scripts/lib/pg-tools.sh"

BACKUP_DIR="${ROOT}/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_URL="$(sanitize_pg_url "${LOCAL_DATABASE_URL:-postgresql://bajriwala:bajriwala@localhost:5432/bajriwala}")"
DO_URL="${DO_DATABASE_URL:-}"
if [[ -n "${DO_URL}" ]]; then
  DO_URL="$(sanitize_pg_url "${DO_URL}")"
fi

AUTO_YES=false
SKIP_PROD_BACKUP=false
for arg in "$@"; do
  case "${arg}" in
    --yes|-y) AUTO_YES=true ;;
    --skip-prod-backup) SKIP_PROD_BACKUP=true ;;
  esac
done

mkdir -p "${BACKUP_DIR}"

echo "=== Phase 1: Local backup ==="
LOCAL_DUMP="${BACKUP_DIR}/local-bajriwala-${TIMESTAMP}.dump"
pg_dump_url "${LOCAL_URL}" "${LOCAL_DUMP}"
echo "Local backup: ${LOCAL_DUMP} ($(du -h "${LOCAL_DUMP}" | cut -f1))"

if [[ -z "${DO_URL}" ]]; then
  echo ""
  echo "DO_DATABASE_URL is not set."
  echo "Set it from DigitalOcean → Databases → Connection Details (public URL)."
  echo "Add your IP to Trusted Sources before connecting."
  echo "Local backup saved — restore manually when ready:"
  echo "  pg_restore --clean --if-exists --no-owner --no-acl -d \"\$DO_DATABASE_URL\" \"${LOCAL_DUMP}\""
  exit 0
fi

if ! ensure_pg_tools; then
  echo ""
  echo "DO_DATABASE_URL is set, but pg_restore/psql are required for remote migration."
  echo "Install client tools:"
  echo "  brew install libpq"
  echo "  export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\""
  echo ""
  echo "Local backup saved at: ${LOCAL_DUMP}"
  exit 1
fi

wait_for_do_database "${DO_URL}" || exit 1

if [[ "${SKIP_PROD_BACKUP}" == true ]]; then
  echo ""
  echo "=== Phase 2: Production backup (skipped) ==="
  DO_BACKUP=""
else
  echo ""
  echo "=== Phase 2: Production backup (before restore) ==="
  DO_BACKUP="${BACKUP_DIR}/do-before-restore-${TIMESTAMP}.dump"
  pg_dump_url "${DO_URL}" "${DO_BACKUP}"
  echo "Production backup: ${DO_BACKUP} ($(du -h "${DO_BACKUP}" | cut -f1))"
fi

echo ""
echo "=== Phase 3: Audit row counts ==="
audit() {
  local label="$1" url="$2"
  echo "--- ${label} ---"
  psql "${url}" -At -c "
    SELECT 'hub_users' || '=' || COUNT(*) FROM hub_users WHERE deleted_at IS NULL
    UNION ALL SELECT 'hubs' || '=' || COUNT(*) FROM hubs
    UNION ALL SELECT 'products' || '=' || COUNT(*) FROM products
    UNION ALL SELECT 'orders' || '=' || COUNT(*) FROM orders
    UNION ALL SELECT 'hub_inventory' || '=' || COUNT(*) FROM hub_inventory;
  " 2>/dev/null || echo "(audit query failed)"
}

audit "LOCAL" "${LOCAL_URL}"
audit "DO (before)" "${DO_URL}"

echo ""
echo "=== Phase 4: Restore local dump to DigitalOcean ==="
if [[ -n "${DO_BACKUP}" ]]; then
  echo "Production backup saved at ${DO_BACKUP}"
fi
if [[ "${AUTO_YES}" != true ]]; then
  read -r -p "Proceed with pg_restore? [y/N] " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

pg_restore_url "${DO_URL}" "${LOCAL_DUMP}"

echo ""
echo "=== Phase 5: Apply pending Prisma migrations ==="
cd "${ROOT}"
DATABASE_URL="${DO_URL}" npx prisma migrate deploy

echo ""
audit "DO (after)" "${DO_URL}"
echo ""
echo "Migration complete."
