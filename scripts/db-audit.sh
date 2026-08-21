#!/usr/bin/env bash
# Audit local and/or DigitalOcean PostgreSQL row counts (no secrets logged).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://bajriwala:bajriwala@localhost:5432/bajriwala?schema=public}"
DO_URL="${DO_DATABASE_URL:-}"

audit_db() {
  local label="$1" url="$2"
  echo "=== ${label} ==="
  psql "${url}" -At -c "
    SELECT 'hub_users' || ': ' || COUNT(*) FROM hub_users WHERE deleted_at IS NULL
    UNION ALL SELECT 'hubs' || ': ' || COUNT(*) FROM hubs
    UNION ALL SELECT 'admin_users' || ': ' || COUNT(*) FROM admin_users
    UNION ALL SELECT 'customers' || ': ' || COUNT(*) FROM customers
    UNION ALL SELECT 'products' || ': ' || COUNT(*) FROM products
    UNION ALL SELECT 'orders' || ': ' || COUNT(*) FROM orders
    UNION ALL SELECT 'hub_inventory' || ': ' || COUNT(*) FROM hub_inventory
    UNION ALL SELECT 'categories' || ': ' || COUNT(*) FROM categories
    UNION ALL SELECT 'drivers' || ': ' || COUNT(*) FROM drivers
    UNION ALL SELECT 'vehicles' || ': ' || COUNT(*) FROM vehicles;
  " 2>/dev/null || echo "  (connection failed)"
  psql "${url}" -At -c "
    SELECT 'hubmanager01' || ': ' ||
      CASE WHEN COUNT(*) > 0 THEN 'exists (role=' || MAX(role) || ')' ELSE 'missing' END
    FROM hub_users WHERE employee_id = 'hubmanager01' AND deleted_at IS NULL;
  " 2>/dev/null || true
  echo ""
}

if psql "${LOCAL_URL}" -c "SELECT 1" >/dev/null 2>&1; then
  audit_db "LOCAL DATABASE" "${LOCAL_URL}"
else
  echo "=== LOCAL DATABASE ==="
  echo "  PostgreSQL not reachable (start: docker compose up -d postgres)"
  echo ""
fi

if [[ -n "${DO_URL}" ]]; then
  audit_db "DIGITALOCEAN DATABASE" "${DO_URL}"
else
  echo "=== DIGITALOCEAN DATABASE ==="
  echo "  Set DO_DATABASE_URL to audit production."
  echo ""
fi
