/** Browser origins that must work even if DigitalOcean CORS_ORIGINS is stale. */
export const PRODUCTION_FRONTEND_ORIGINS = [
  'https://vikram-admin.vercel.app',
  'https://vikram-hub-panel-frontend.vercel.app',
] as const;

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
  const parsed =
    raw == null || raw.trim() === ''
      ? [...fallback]
      : raw
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0 && origin !== '*');

  return [...new Set([...parsed, ...PRODUCTION_FRONTEND_ORIGINS])];
}

export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
  options: { allowLocalhostInDev?: boolean; isProduction?: boolean } = {},
): boolean {
  if (!origin) {
    return true;
  }
  if (allowed.includes(origin) || isVercelFrontendOrigin(origin)) {
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

function isVercelFrontendOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:' || !hostname.endsWith('.vercel.app')) {
      return false;
    }
    return (
      hostname === 'vikram-admin.vercel.app' ||
      hostname.startsWith('vikram-admin-') ||
      hostname === 'vikram-hub-panel-frontend.vercel.app' ||
      hostname.startsWith('vikram-hub-panel-frontend-')
    );
  } catch {
    return false;
  }
}
