/**
 * Production bootstrap entrypoint used during deploy.
 * 1) Full seed when catalog/hubs are empty
 * 2) Minimal hub auth bootstrap when hubmanager01 is missing
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import pg from 'pg';
import {
  buildPgPoolConfig,
  resolveDatabaseUrlFromEnv,
} from '../src/common/database/postgres-url';

async function countRows(
  pool: pg.Pool,
  sql: string,
): Promise<number> {
  const result = await pool.query<{ count: string }>(sql);
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

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

  const pool = new pg.Pool(
    buildPgPoolConfig({
      databaseUrl,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 15000,
      nodeEnv: process.env.NODE_ENV,
      caCert: process.env.DATABASE_CA_CERT,
    }),
  );

  try {
    const hubManagerExists =
      (await countRows(
        pool,
        `SELECT COUNT(*)::text AS count FROM hub_users
         WHERE employee_id = 'hubmanager01' AND deleted_at IS NULL`,
      )) > 0;

    if (hubManagerExists) {
      console.log('[db-seed-if-empty] hubmanager01 already exists — done.');
      return;
    }

    const productCount = await countRows(
      pool,
      'SELECT COUNT(*)::text AS count FROM products',
    );

    if (productCount === 0) {
      console.log(
        '[db-seed-if-empty] Empty catalog — running full prisma seed...',
      );
      execSync('npm run prisma:seed', { stdio: 'inherit', env: process.env });
      return;
    }

    console.log(
      '[db-seed-if-empty] hubmanager01 missing — running minimal hub auth bootstrap...',
    );
    execSync('tsx scripts/bootstrap-hub-auth.ts', {
      stdio: 'inherit',
      env: process.env,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db-seed-if-empty] Failed:', error);
  process.exit(1);
});
