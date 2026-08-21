/**
 * Minimal production bootstrap: ensures hubmanager01 can log in.
 * Uses an existing active hub when present; otherwise creates Kalyani Hub.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import pg from 'pg';
import {
  buildPgPoolConfig,
  resolveDatabaseUrlFromEnv,
} from '../src/common/database/postgres-url';

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrlFromEnv();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
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
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM hub_users
       WHERE employee_id = 'hubmanager01' AND deleted_at IS NULL
       LIMIT 1`,
    );
    if (existing.rows.length > 0) {
      console.log('[bootstrap-hub-auth] hubmanager01 already exists.');
      return;
    }

    console.log('[bootstrap-hub-auth] Creating hub + hubmanager01...');
    const passwordHash = await bcrypt.hash('123456', 10);

    await pool.query('BEGIN');

    const activeHub = await pool.query<{ id: string }>(
      `SELECT id FROM hubs
       WHERE deleted_at IS NULL AND is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
    );

    let hubId = activeHub.rows[0]?.id;

    if (!hubId) {
      const hubResult = await pool.query<{ id: string }>(
        `INSERT INTO hubs (
           id, code, name, address_line1, city, state, pincode,
           latitude, longitude, phone, warehouse_code,
           coverage_pincodes, service_radius_km, is_active, status,
           created_at, updated_at
         )
         VALUES (
           gen_random_uuid(), 'HUB-KAL-01', 'Kalyani Hub',
           'Industrial Estate, Kalyani', 'Kalyani', 'West Bengal', '741235',
           22.9751, 88.4345, '9876543220', 'WH-KLY-01',
           ARRAY['741235','741245','741246','741247','741248'], 15, true, 'ACTIVE',
           NOW(), NOW()
         )
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           is_active = true,
           deleted_at = NULL,
           updated_at = NOW()
         RETURNING id`,
      );
      hubId = hubResult.rows[0]?.id;
    }

    if (!hubId) {
      throw new Error('Failed to resolve hub id');
    }

    await pool.query(
      `INSERT INTO hub_users (
         id, employee_id, email, password_hash, full_name, phone,
         role, hub_id, is_active, created_at, updated_at
       )
       VALUES (
         gen_random_uuid(), 'hubmanager01', 'rahul.sharma@hubops.com',
         $1, 'Rahul Sharma', '9876500001', 'HUB_MANAGER', $2, true, NOW(), NOW()
       )
       ON CONFLICT (employee_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = 'HUB_MANAGER',
         hub_id = EXCLUDED.hub_id,
         is_active = true,
         deleted_at = NULL,
         updated_at = NOW()`,
      [passwordHash, hubId],
    );

    await pool.query('COMMIT');
    console.log('[bootstrap-hub-auth] hubmanager01 ready.');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[bootstrap-hub-auth] Failed:', error);
  process.exit(1);
});
