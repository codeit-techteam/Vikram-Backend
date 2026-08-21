import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PoolConfig } from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SECRET_URL_PATTERN = /postgres(?:ql)?:\/\/[^@\s]+@/gi;

export type DatabaseUrlMeta = {
  protocol: string;
  host: string;
  port: string;
  database: string;
  user: string;
  sslmode: string | null;
  schema: string | null;
  hasPassword: boolean;
};

export type DatabaseErrorDiagnostic = {
  category: string;
  prismaCode?: string;
  pgCode?: string;
  reason: string;
};

export function redactSecrets(value: string): string {
  return value.replace(SECRET_URL_PATTERN, 'postgresql://***:***@');
}

export function parseDatabaseUrlMeta(databaseUrl: string): DatabaseUrlMeta {
  const parsed = new URL(databaseUrl);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database:
      decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'unknown',
    user: decodeURIComponent(parsed.username || ''),
    sslmode: parsed.searchParams.get('sslmode'),
    schema: parsed.searchParams.get('schema'),
    hasPassword: Boolean(parsed.password),
  };
}

export function isLocalDatabaseHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

export function isProductionNodeEnv(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const normalized = nodeEnv?.trim().toLowerCase();
  return normalized === 'production' || normalized === 'staging';
}

export type DatabaseUrlSource = 'DATABASE_URL' | 'DATABASE_PRIVATE_URL';

export type ResolveDatabaseUrlOptions = {
  /** Skip unresolved DigitalOcean ${db...} placeholders (e.g. prisma generate at build time). */
  skipUnresolvedBindables?: boolean;
};

export function isUnresolvedDatabaseBindPlaceholder(value: string): boolean {
  return value.includes('${');
}

function validateDatabaseUrlCandidate(
  raw: string | undefined,
  options?: ResolveDatabaseUrlOptions,
): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  if (isUnresolvedDatabaseBindPlaceholder(value)) {
    if (options?.skipUnresolvedBindables) {
      return undefined;
    }
    throw new Error(
      'DATABASE_BINDABLE_URL_UNRESOLVED: DATABASE_URL/DATABASE_PRIVATE_URL ' +
        'still contains an unresolved DigitalOcean bind placeholder. ' +
        'Attach the managed database to the App Platform component and set ' +
        'DATABASE_URL=${db-pgsql-blr1-63888.DATABASE_PRIVATE_URL} ' +
        '(or .DATABASE_URL) as a bindable value — not a pasted literal ${...} string.',
    );
  }
  if (/YOUR_|CHANGE_ME|<\w+>/i.test(value)) {
    throw new Error(
      'DATABASE_URL is a placeholder. Replace YOUR_/CHANGE_ME values before deploying.',
    );
  }
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error(
      'DATABASE_URL must start with postgresql:// or postgres://.',
    );
  }
  return value;
}

/** Ordered candidates: VPC private URL first in production (DigitalOcean App Platform). */
export function resolveDatabaseUrlCandidatesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options?: ResolveDatabaseUrlOptions,
): Array<{ url: string; source: DatabaseUrlSource }> {
  const isProduction = isProductionNodeEnv(env.NODE_ENV);
  const ordered: Array<[string | undefined, DatabaseUrlSource]> = isProduction
    ? [
        [env.DATABASE_PRIVATE_URL, 'DATABASE_PRIVATE_URL'],
        [env.DATABASE_URL, 'DATABASE_URL'],
      ]
    : [
        [env.DATABASE_URL, 'DATABASE_URL'],
        [env.DATABASE_PRIVATE_URL, 'DATABASE_PRIVATE_URL'],
      ];

  const seen = new Set<string>();
  const result: Array<{ url: string; source: DatabaseUrlSource }> = [];
  for (const [raw, source] of ordered) {
    const url = validateDatabaseUrlCandidate(raw, options);
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push({ url, source });
    }
  }
  return result;
}

export function isManagedDigitalOceanPostgres(
  meta: Pick<DatabaseUrlMeta, 'host' | 'port'>,
): boolean {
  return (
    meta.host.endsWith('.ondigitalocean.com') ||
    meta.host.includes('.db.ondigitalocean.com') ||
    meta.port === '25060'
  );
}

export function assertProductionDatabaseUrl(databaseUrl: string): void {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    throw new Error('DATABASE_URL is required in production.');
  }
  if (trimmed.includes('${') || /YOUR_|CHANGE_ME|<\w+>/i.test(trimmed)) {
    throw new Error(
      'DATABASE_URL is a placeholder or unresolved bindable variable. ' +
        'On DigitalOcean App Platform, set DATABASE_URL to ${<database-component>.DATABASE_URL} ' +
        'or ${<database-component>.DATABASE_PRIVATE_URL} as a bindable value (not a pasted literal ${...} string).',
    );
  }
  if (!/^postgres(?:ql)?:\/\//i.test(trimmed)) {
    throw new Error(
      'DATABASE_URL must start with postgresql:// or postgres://.',
    );
  }

  let meta: DatabaseUrlMeta;
  try {
    meta = parseDatabaseUrlMeta(trimmed);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid PostgreSQL connection string.',
    );
  }

  if (!meta.host || isLocalDatabaseHost(meta.host)) {
    throw new Error(
      'Production DATABASE_URL must not use localhost. Use the DigitalOcean Managed PostgreSQL host.',
    );
  }
}

export function resolveCaCertificate(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw =
    env.DATABASE_CA_CERT?.trim() ||
    env.CA_CERT?.trim() ||
    env.DATABASE_CA?.trim();
  return normalizeCaCertificate(raw);
}

/** Returns PEM CA text, or undefined when missing/invalid/unresolved. */
export function normalizeCaCertificate(raw: string | undefined): string | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const value = raw.replace(/\\n/g, '\n').trim();
  if (isUnresolvedDatabaseBindPlaceholder(value)) {
    return undefined;
  }
  if (
    !value.includes('-----BEGIN CERTIFICATE-----') ||
    !value.includes('-----END CERTIFICATE-----')
  ) {
    return undefined;
  }
  return value;
}

/**
 * Primary URL for Prisma/pg. In production prefers DATABASE_PRIVATE_URL (VPC).
 * Rejects unresolved App Platform bind placeholders such as
 * `${db-pgsql-blr1-63888.DATABASE_URL}`.
 */
export function resolveDatabaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options?: ResolveDatabaseUrlOptions,
): string | undefined {
  return resolveDatabaseUrlCandidatesFromEnv(env, options)[0]?.url;
}

export function resolveDatabaseUrlSourceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options?: ResolveDatabaseUrlOptions,
): DatabaseUrlSource | undefined {
  return resolveDatabaseUrlCandidatesFromEnv(env, options)[0]?.source;
}

export function isDatabaseInfrastructureError(error: unknown): boolean {
  const diagnostic = classifyDatabaseError(error);
  return (
    diagnostic.category === 'DATABASE_NETWORK_FAILED' ||
    diagnostic.category === 'DATABASE_SSL_FAILED' ||
    diagnostic.category === 'DATABASE_AUTH_FAILED' ||
    diagnostic.category === 'DATABASE_POOL_EXHAUSTED' ||
    diagnostic.category === 'DATABASE_CONNECTION_FAILED' ||
    diagnostic.category === 'DATABASE_BINDABLE_URL_UNRESOLVED' ||
    diagnostic.prismaCode === 'P1000' ||
    diagnostic.prismaCode === 'P1001' ||
    diagnostic.prismaCode === 'P1002' ||
    diagnostic.prismaCode === 'P1017' ||
    diagnostic.prismaCode === 'P2024'
  );
}

function sslRequired(
  meta: DatabaseUrlMeta,
  nodeEnv: string | undefined,
): boolean {
  const sslmode = meta.sslmode?.toLowerCase();
  if (sslmode === 'disable' || sslmode === 'allow') {
    return false;
  }
  if (
    sslmode === 'require' ||
    sslmode === 'verify-ca' ||
    sslmode === 'verify-full' ||
    sslmode === 'prefer'
  ) {
    return true;
  }
  if (isManagedDigitalOceanPostgres(meta)) {
    return true;
  }
  return nodeEnv === 'production' && !isLocalDatabaseHost(meta.host);
}

export function sanitizeDatabaseUrlForPg(
  databaseUrl: string,
  options?: { caCert?: string; nodeEnv?: string },
): {
  connectionString: string;
  schema: string;
  meta: DatabaseUrlMeta;
} {
  const meta = parseDatabaseUrlMeta(databaseUrl);
  const parsed = new URL(databaseUrl);
  const ca = options?.caCert?.trim();
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;

  // Prisma-only query param; node-postgres would send it as a startup GUC.
  parsed.searchParams.delete('schema');
  // libpq-only params — pg uses PoolConfig.ssl instead.
  parsed.searchParams.delete('sslrootcert');
  parsed.searchParams.delete('sslcert');
  parsed.searchParams.delete('sslkey');

  const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
  if (!ca && (sslmode === 'verify-full' || sslmode === 'verify-ca')) {
    parsed.searchParams.set('sslmode', 'require');
  } else if (
    !parsed.searchParams.get('sslmode') &&
    sslRequired(meta, nodeEnv)
  ) {
    parsed.searchParams.set('sslmode', 'require');
  }

  // node-postgres uses PoolConfig.ssl; drop sslmode to avoid verify conflicts.
  if (sslRequired(meta, nodeEnv)) {
    parsed.searchParams.delete('sslmode');
  }

  return {
    connectionString: parsed.toString(),
    schema: meta.schema || 'public',
    meta: { ...meta, sslmode: parsed.searchParams.get('sslmode') },
  };
}

export function buildPgPoolConfig(options: {
  databaseUrl: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  nodeEnv?: string;
  caCert?: string;
}): PoolConfig & { schema: string } {
  const { connectionString, schema, meta } = sanitizeDatabaseUrlForPg(
    options.databaseUrl,
    { caCert: options.caCert, nodeEnv: options.nodeEnv },
  );
  const config: PoolConfig & { schema: string } = {
    connectionString,
    max: options.max,
    idleTimeoutMillis: options.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    schema,
  };

  if (sslRequired(meta, options.nodeEnv)) {
    const ca = normalizeCaCertificate(options.caCert);
    if (ca) {
      // TLS stays enabled; verify the DigitalOcean CA when a valid PEM is supplied.
      config.ssl = { rejectUnauthorized: true, ca };
    } else {
      // DigitalOcean managed PostgreSQL uses a project CA that Node does not trust
      // by default — encrypt without strict verification unless a valid PEM is set.
      config.ssl = { rejectUnauthorized: false };
    }
  }

  return config;
}

export function applyPrismaEngineSsl(
  databaseUrl: string,
  caCert?: string,
): string {
  const parsed = new URL(databaseUrl);
  const meta = parseDatabaseUrlMeta(databaseUrl);
  if (!sslRequired(meta, process.env.NODE_ENV)) {
    return databaseUrl;
  }

  if (!parsed.searchParams.get('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }

  const cert = caCert?.trim();
  if (cert && !parsed.searchParams.get('sslrootcert')) {
    const certPath = join(tmpdir(), 'vikram-postgresql-ca.crt');
    writeFileSync(certPath, cert, { mode: 0o600 });
    parsed.searchParams.set('sslrootcert', certPath);
  }

  return parsed.toString();
}

export function classifyDatabaseError(error: unknown): DatabaseErrorDiagnostic {
  const err = error as {
    code?: string | number;
    message?: string;
    cause?: { code?: string; syscall?: string; message?: string };
  };
  const prismaCode = typeof err?.code === 'string' ? err.code : undefined;
  const pgCode =
    err?.cause?.code ||
    (typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)
      ? err.code
      : undefined);
  const reason = redactSecrets(
    String(err?.cause?.message || err?.message || error),
  );
  const combined =
    `${prismaCode ?? ''} ${pgCode ?? ''} ${reason}`.toLowerCase();

  if (reason.includes('${')) {
    return {
      category: 'DATABASE_BINDABLE_URL_UNRESOLVED',
      prismaCode,
      pgCode,
      reason,
    };
  }
  if (
    /self-signed|certificate|ssl|tls|cert_untrusted|unable to verify/i.test(
      combined,
    )
  ) {
    return {
      category: 'DATABASE_SSL_FAILED',
      prismaCode,
      pgCode,
      reason,
    };
  }
  if (
    /etimedout|timeout|econnrefused|enotfound|ehostunreach|econnreset|enxio|can't reach database|could not connect|connection terminated/i.test(
      combined,
    )
  ) {
    return {
      category: 'DATABASE_NETWORK_FAILED',
      prismaCode,
      pgCode,
      reason,
    };
  }
  if (
    /password authentication|28p01|28000|invalid authorization/i.test(combined)
  ) {
    return {
      category: 'DATABASE_AUTH_FAILED',
      prismaCode,
      pgCode,
      reason,
    };
  }
  if (/too many connections|53300/i.test(combined)) {
    return {
      category: 'DATABASE_POOL_EXHAUSTED',
      prismaCode,
      pgCode,
      reason,
    };
  }

  return {
    category: 'DATABASE_CONNECTION_FAILED',
    prismaCode,
    pgCode,
    reason,
  };
}

export function formatDatabaseDiagnostic(
  diagnostic: DatabaseErrorDiagnostic,
  meta: Partial<DatabaseUrlMeta>,
  nodeEnv: string,
): string {
  return [
    diagnostic.category,
    `env=${nodeEnv}`,
    meta.host ? `host=${meta.host}` : null,
    meta.port ? `port=${meta.port}` : null,
    meta.sslmode ? `sslmode=${meta.sslmode}` : null,
    diagnostic.prismaCode ? `prismaCode=${diagnostic.prismaCode}` : null,
    diagnostic.pgCode ? `pgCode=${diagnostic.pgCode}` : null,
    `reason=${diagnostic.reason}`,
  ]
    .filter(Boolean)
    .join(' ');
}
