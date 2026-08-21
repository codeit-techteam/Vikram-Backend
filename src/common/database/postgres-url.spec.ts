import {
  assertProductionDatabaseUrl,
  buildPgPoolConfig,
  classifyDatabaseError,
  redactSecrets,
  sanitizeDatabaseUrlForPg,
} from './postgres-url';

describe('postgres-url', () => {
  it('redacts credentials from connection strings in error text', () => {
    expect(
      redactSecrets(
        'error postgresql://doadmin:super-secret@db.example.com:25060/defaultdb?sslmode=require failed',
      ),
    ).toBe(
      'error postgresql://***:***@db.example.com:25060/defaultdb?sslmode=require failed',
    );
  });

  it('rejects unresolved bindable DATABASE_URL values in production', () => {
    expect(() =>
      assertProductionDatabaseUrl('${db-pgsql-blr1-63888.DATABASE_URL}'),
    ).toThrow(/unresolved bindable variable/i);
  });

  it('rejects localhost DATABASE_URL values in production', () => {
    expect(() =>
      assertProductionDatabaseUrl(
        'postgresql://bajriwala:bajriwala@localhost:5432/bajriwala',
      ),
    ).toThrow(/must not use localhost/i);
  });

  it('strips Prisma schema query param before handing the URL to pg', () => {
    const result = sanitizeDatabaseUrlForPg(
      'postgresql://user:pass@db.ondigitalocean.com:25060/defaultdb?sslmode=require&schema=public',
    );
    expect(result.schema).toBe('public');
    expect(result.connectionString).not.toContain('schema=');
    expect(result.connectionString).toContain('sslmode=require');
  });

  it('keeps TLS enabled for DigitalOcean hosts when no CA is provided', () => {
    const config = buildPgPoolConfig({
      databaseUrl:
        'postgresql://doadmin:secret@db-pgsql-blr1-63888.db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      nodeEnv: 'production',
    });
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toContain('sslmode=require');
  });

  it('verifies TLS when a CA certificate is supplied', () => {
    const config = buildPgPoolConfig({
      databaseUrl:
        'postgresql://doadmin:secret@db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      nodeEnv: 'production',
      caCert: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    });
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((config.ssl as { ca?: string }).ca).toContain('BEGIN CERTIFICATE');
  });

  it('does not force SSL for local development URLs without sslmode', () => {
    const config = buildPgPoolConfig({
      databaseUrl: 'postgresql://bajriwala:bajriwala@localhost:5432/bajriwala',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      nodeEnv: 'development',
    });
    expect(config.ssl).toBeUndefined();
  });

  it('classifies TLS failures without exposing secrets', () => {
    const diagnostic = classifyDatabaseError(
      new Error(
        'self-signed certificate in certificate chain postgresql://doadmin:hunter2@host:25060/db',
      ),
    );
    expect(diagnostic.category).toBe('DATABASE_SSL_FAILED');
    expect(diagnostic.reason).not.toContain('hunter2');
  });
});
