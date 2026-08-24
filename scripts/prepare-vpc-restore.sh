#!/usr/bin/env bash
# Prepare + trigger VPC restore when local pg_dump to DO is blocked by Trusted Sources.
#
# 1) Creates a plain SQL dump from local Postgres
# 2) Uploads it to transfer.sh (temporary HTTPS URL)
# 3) Prints the URL to set as DB_RESTORE_SQL_URL on DigitalOcean App Platform
#
# Usage:
#   npm run db:prepare:vpc-restore
#   # set DB_RESTORE_SQL_URL on DO → redeploy → unset after success

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/pg-tools.sh
source "${ROOT}/scripts/lib/pg-tools.sh"

BACKUP_DIR="${ROOT}/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_URL="$(sanitize_pg_url "${LOCAL_DATABASE_URL:-postgresql://bajriwala:bajriwala@localhost:5432/bajriwala}")"
SQL_FILE="${BACKUP_DIR}/local-bajriwala-${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

if ! ensure_pg_tools; then
  echo "Install PostgreSQL client tools: brew install libpq"
  exit 1
fi

echo "=== Creating plain SQL dump from local database ==="
pg_dump \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --dbname="${LOCAL_URL}" \
  > "${SQL_FILE}"

echo "SQL dump: ${SQL_FILE} ($(du -h "${SQL_FILE}" | cut -f1))"

echo ""
echo "=== Uploading dump (temporary URL, expires ~14 days) ==="
UPLOAD_URL="$(curl -s --upload-file "${SQL_FILE}" "https://transfer.sh/$(basename "${SQL_FILE}")")"
if [[ -z "${UPLOAD_URL}" || "${UPLOAD_URL}" != http* ]]; then
  echo "Upload failed. Response: ${UPLOAD_URL}"
  exit 1
fi

echo "Uploaded: ${UPLOAD_URL}"
echo ""
echo "=== Next: restore over App Platform VPC (no Trusted Sources needed) ==="
echo "1. DigitalOcean → App Platform → bajriwala-backend → vikram-backend → Settings → Environment Variables"
echo "2. Add RUNTIME variable:"
echo "     DB_RESTORE_SQL_URL=${UPLOAD_URL}"
echo "3. Save and redeploy (or push latest main — start:prod runs restore when set)"
echo "4. After deploy succeeds, DELETE DB_RESTORE_SQL_URL and redeploy again"
echo ""
echo "Local custom dump (optional manual path after Trusted Sources):"
echo "  latest .dump in ${BACKUP_DIR}/"
