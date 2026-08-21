import {
  assertProductionDatabaseUrl,
  buildPgPoolConfig,
  classifyDatabaseError,
  isDatabaseInfrastructureError,
  redactSecrets,
  resolveDatabaseUrlCandidatesFromEnv,
  resolveDatabaseUrlFromEnv,
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

  it('detects unresolved DigitalOcean bind placeholders from env', () => {
    expect(() =>
      resolveDatabaseUrlFromEnv({
        DATABASE_URL: '${db-pgsql-blr1-63888.DATABASE_URL}',
      }),
    ).toThrow(/DATABASE_BINDABLE_URL_UNRESOLVED/);
  });

  it('skips unresolved bind placeholders during prisma generate (build time)', () => {
    expect(
      resolveDatabaseUrlFromEnv(
        {
          DATABASE_URL: '${db-pgsql-blr1-63888.DATABASE_PRIVATE_URL}',
          DATABASE_PRIVATE_URL: '${db-pgsql-blr1-63888.DATABASE_PRIVATE_URL}',
        },
        { skipUnresolvedBindables: true },
      ),
    ).toBeUndefined();
  });

  it('falls back to DATABASE_PRIVATE_URL when DATABASE_URL is unset', () => {
    expect(
      resolveDatabaseUrlFromEnv({
        DATABASE_PRIVATE_URL:
          'postgresql://doadmin:secret@private-db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      }),
    ).toContain('private-db.ondigitalocean.com');
  });

  it('prefers DATABASE_PRIVATE_URL in production when both are set', () => {
    const candidates = resolveDatabaseUrlCandidatesFromEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://doadmin:secret@public-db.ondigitalocean.com:25060/defaultdb?sslmode=require',
      DATABASE_PRIVATE_URL:
        'postgresql://doadmin:secret@private-db.ondigitalocean.com:25060/defaultdb?sslmode=require',
    });
    expect(candidates[0]?.source).toBe('DATABASE_PRIVATE_URL');
    expect(candidates[0]?.url).toContain('private-db.ondigitalocean.com');
  });

  it('prefers DATABASE_URL in development when both are set', () => {
    const candidates = resolveDatabaseUrlCandidatesFromEnv({
      NODE_ENV: 'development',
      DATABASE_URL:
        'postgresql://bajriwala:bajriwala@localhost:5432/bajriwala?schema=public',
      DATABASE_PRIVATE_URL:
        'postgresql://doadmin:secret@private-db.ondigitalocean.com:25060/defaultdb?sslmode=require',
    });
    expect(candidates[0]?.source).toBe('DATABASE_URL');
    expect(candidates[0]?.url).toContain('localhost');
  });

  it('downgrades verify-full to require when no CA certificate is available', () => {
    const result = sanitizeDatabaseUrlForPg(
      'postgresql://user:pass@db.ondigitalocean.com:25060/defaultdb?sslmode=verify-full&sslrootcert=/tmp/ca.crt&schema=public',
    );
    expect(result.connectionString).toContain('sslmode=require');
    expect(result.connectionString).not.toContain('sslrootcert');
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

  it('classifies network failures as infrastructure errors', () => {
    const error = Object.assign(new Error("Can't reach database server"), {
      code: 'P1001',
    });
    expect(classifyDatabaseError(error).category).toBe(
      'DATABASE_NETWORK_FAILED',
    );
    expect(isDatabaseInfrastructureError(error)).toBe(true);
  });
});
