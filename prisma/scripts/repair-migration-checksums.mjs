/**
 * One-time repair: sync _prisma_migrations checksums after fixing migration SQL files.
 * Run: node prisma/scripts/repair-migration-checksums.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

const MIGRATIONS_TO_REPAIR = [
  '20260721121458_admin_hub_management',
  '20260721160000_hub_panel',
  '20260722150000_support_message_conversation',
];

function checksumFor(migrationName) {
  const filePath = path.join(migrationsDir, migrationName, 'migration.sql');
  const contents = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(contents).digest('hex');
}

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/bajriwala?schema=public';

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  for (const migrationName of MIGRATIONS_TO_REPAIR) {
    const checksum = checksumFor(migrationName);
    const result = await client.query(
      `UPDATE "_prisma_migrations" SET checksum = $1 WHERE migration_name = $2`,
      [checksum, migrationName],
    );
    console.log(`${migrationName}: checksum updated (${result.rowCount} row)`);
  }

  console.log('Done. Run: npx prisma migrate dev');
} finally {
  await client.end();
}
