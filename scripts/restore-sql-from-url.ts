/**
 * One-time production restore over VPC (no Trusted Sources needed).
 * Set DB_RESTORE_SQL_URL to a downloadable plain SQL dump, deploy, then unset.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolveDatabaseUrlFromEnv } from '../src/common/database/postgres-url';

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download SQL dump (${response.status})`);
  }
  const body = response.body;
  if (!body) {
    throw new Error('Download response had no body');
  }
  await pipeline(Readable.fromWeb(body as never), createWriteStream(destination));
}

async function main(): Promise<void> {
  const restoreUrl = process.env.DB_RESTORE_SQL_URL?.trim();
  if (!restoreUrl) {
    console.log('[restore-sql-from-url] DB_RESTORE_SQL_URL not set — skipping.');
    return;
  }

  if (!resolveDatabaseUrlFromEnv()) {
    throw new Error('DATABASE_URL is not configured');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'vikram-sql-restore-'));
  const sqlPath = join(workDir, 'restore.sql');

  try {
    console.log('[restore-sql-from-url] Downloading SQL dump...');
    await download(restoreUrl, sqlPath);

    console.log('[restore-sql-from-url] Applying SQL via prisma db execute...');
    execSync(`npx prisma db execute --file "${sqlPath}"`, {
      stdio: 'inherit',
      env: process.env,
    });

    console.log('[restore-sql-from-url] Restore completed.');
    console.log(
      '[restore-sql-from-url] Remove DB_RESTORE_SQL_URL from App Platform and redeploy.',
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error('[restore-sql-from-url] Failed:', error);
  process.exit(1);
});
