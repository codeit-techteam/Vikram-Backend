/**
 * Idempotent bootstrap: runs prisma/seed.ts when required hub login accounts
 * are missing. Safe to run on every production deploy (seed uses upserts).
 *
 * Skips when DB_SEED_IF_EMPTY=false.
 * In production, runs automatically unless explicitly disabled.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';
import {
  buildPgPoolConfig,
  resolveDatabaseUrlFromEnv,
} from '../src/common/database/postgres-url';

async function main(): Promise<void> {
  const explicitOff =
    process.env.DB_SEED_IF_EMPTY?.trim().toLowerCase() === 'false';
  if (explicitOff) {
    console.log('[db-seed-if-empty] DB_SEED_IF_EMPTY=false — skipping.');
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const explicitOn =
    process.env.DB_SEED_IF_EMPTY?.trim().toLowerCase() === 'true';
  if (!isProduction && !explicitOn) {
    console.log(
      '[db-seed-if-empty] Not production and DB_SEED_IF_EMPTY is not true — skipping.',
    );
    return;
  }

  const databaseUrl = resolveDatabaseUrlFromEnv();
  if (!databaseUrl) {
    console.error('[db-seed-if-empty] DATABASE_URL is not configured.');
    process.exit(1);
  }

  const poolConfig = buildPgPoolConfig({
    databaseUrl,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 15000,
    nodeEnv: process.env.NODE_ENV,
    caCert: process.env.DATABASE_CA_CERT,
  });
  const pool = new pg.Pool(poolConfig);

  try {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM hub_users
       WHERE employee_id = 'hubmanager01' AND deleted_at IS NULL`,
    );
    const hubManagerExists =
      Number.parseInt(result.rows[0]?.count ?? '0', 10) > 0;

    if (hubManagerExists) {
      console.log(
        '[db-seed-if-empty] hubmanager01 already exists — seed not required.',
      );
      return;
    }

    console.log(
      '[db-seed-if-empty] hubmanager01 missing — running prisma seed (upserts)...',
    );
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
