/**
 * Idempotent bootstrap: runs prisma/seed.ts only when hub_users is empty.
 * Used on production deploy when DB_SEED_IF_EMPTY=true (safe default: skip).
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { resolveDatabaseUrlFromEnv } from '../src/common/database/postgres-url';

async function main(): Promise<void> {
  if (process.env.DB_SEED_IF_EMPTY?.trim().toLowerCase() !== 'true') {
    console.log('[db-seed-if-empty] DB_SEED_IF_EMPTY is not true — skipping.');
    return;
  }

  const databaseUrl = resolveDatabaseUrlFromEnv();
  if (!databaseUrl) {
    console.error('[db-seed-if-empty] DATABASE_URL is not configured — skipping.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('ondigitalocean.com')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM hub_users WHERE deleted_at IS NULL',
    );
    const count = Number.parseInt(result.rows[0]?.count ?? '0', 10);

    if (count > 0) {
      console.log(
        `[db-seed-if-empty] Found ${count} hub user(s) — seed not required.`,
      );
      return;
    }

    console.log('[db-seed-if-empty] No hub users found — running prisma seed...');
    execSync('npm run prisma:seed', { stdio: 'inherit', env: process.env });
    console.log('[db-seed-if-empty] Seed completed.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db-seed-if-empty] Failed:', error);
  process.exit(1);
});
