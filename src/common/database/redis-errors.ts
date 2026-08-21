export type RedisErrorDiagnostic = {
  category:
    | 'REDIS_CONNECTED'
    | 'REDIS_TIMEOUT'
    | 'REDIS_AUTH_FAILED'
    | 'REDIS_RATE_LIMITED'
    | 'REDIS_CONNECTION_FAILED';
  reason: string;
};

export function classifyRedisError(error: unknown): RedisErrorDiagnostic {
  const reason = String(
    (error as { message?: string })?.message || error || 'unknown',
  );
  const combined = reason.toLowerCase();

  if (/max requests limit|ooms|maxmemory|loading redis/i.test(combined)) {
    return { category: 'REDIS_RATE_LIMITED', reason };
  }
  if (/etimedout|timeout|timed out/i.test(combined)) {
    return { category: 'REDIS_TIMEOUT', reason };
  }
  if (/noauth|wrong pass|invalid password|authentication|unauthorized/i.test(combined)) {
    return { category: 'REDIS_AUTH_FAILED', reason };
  }
  if (
    /econnrefused|enotfound|ehostunreach|econnreset|socket closed|connection is closed/i.test(
      combined,
    )
  ) {
    return { category: 'REDIS_CONNECTION_FAILED', reason };
  }

  return { category: 'REDIS_CONNECTION_FAILED', reason };
}

export function formatRedisDiagnostic(
  diagnostic: RedisErrorDiagnostic,
  meta: { host?: string; port?: number; tls?: boolean; environment?: string },
): string {
  return [
    diagnostic.category,
    meta.environment ? `env=${meta.environment}` : null,
    meta.host ? `host=${meta.host}` : null,
    meta.port != null ? `port=${meta.port}` : null,
    meta.tls != null ? `tls=${meta.tls}` : null,
    `reason=${diagnostic.reason}`,
  ]
    .filter(Boolean)
    .join(' ');
}
