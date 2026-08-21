/**
 * Parse CORS_ORIGINS into a clean allow-list.
 * Never returns '*'; empty entries are dropped.
 */
export function parseCorsOrigins(
  raw: string | undefined,
  fallback: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8081',
  ],
): string[] {
  if (raw == null || raw.trim() === '') {
    return [...fallback];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');
}

export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
  options: { allowLocalhostInDev?: boolean; isProduction?: boolean } = {},
): boolean {
  if (!origin) {
    return true;
  }
  if (allowed.includes(origin)) {
    return true;
  }
  if (
    !options.isProduction &&
    options.allowLocalhostInDev !== false &&
    (origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('exp://'))
  ) {
    return true;
  }
  return false;
}
