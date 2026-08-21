#!/usr/bin/env bash
# Safe local → DigitalOcean PostgreSQL migration helper.
# Requires: pg_dump, pg_restore, psql (brew install libpq)
#
# Usage:
#   export DO_DATABASE_URL='postgresql://...'   # from DO dashboard (Trusted Sources required)
#   ./scripts/migrate-local-to-do.sh
#
# Never commit connection strings or passwords.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${ROOT}/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://bajriwala:bajriwala@localhost:5432/bajriwala?schema=public}"
DO_URL="${DO_DATABASE_URL:-}"

mkdir -p "${BACKUP_DIR}"

echo "=== Phase 1: Local backup ==="
LOCAL_DUMP="${BACKUP_DIR}/local-bajriwala-${TIMESTAMP}.dump"
PGPASSWORD="${PGPASSWORD:-}" pg_dump -Fc -f "${LOCAL_DUMP}" "${LOCAL_URL}" 2>/dev/null || \
  pg_dump -Fc -f "${LOCAL_DUMP}" "${LOCAL_URL}"
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

echo ""
echo "=== Phase 2: Production backup (before restore) ==="
DO_BACKUP="${BACKUP_DIR}/do-before-restore-${TIMESTAMP}.dump"
pg_dump -Fc -f "${DO_BACKUP}" "${DO_URL}"
echo "Production backup: ${DO_BACKUP} ($(du -h "${DO_BACKUP}" | cut -f1))"

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
echo "This will merge/replace data. Production backup saved at ${DO_BACKUP}"
read -r -p "Proceed with pg_restore? [y/N] " confirm
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

pg_restore --clean --if-exists --no-owner --no-acl -d "${DO_URL}" "${LOCAL_DUMP}"

echo ""
echo "=== Phase 5: Apply pending Prisma migrations ==="
cd "${ROOT}"
DATABASE_URL="${DO_URL}" npx prisma migrate deploy

echo ""
audit "DO (after)" "${DO_URL}"
echo ""
echo "Migration complete."
