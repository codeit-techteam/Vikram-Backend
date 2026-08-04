/**
 * Shared media URL helpers for Backend serializers.
 * Ensures customers never receive relative `/assets/...` paths.
 */

const TRANSPARENT_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function isAbsoluteMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const value = url.trim();
  return value.startsWith('http://') || value.startsWith('https://');
}

export function isLegacyAssetPath(url?: string | null): boolean {
  if (!url) return false;
  const value = url.trim();
  return (
    value.startsWith('/assets/') ||
    value.startsWith('assets/') ||
    value.includes('/assets/')
  );
}

/** Prefer Cloudflare R2 public URLs over third-party CDNs (e.g. broken Unsplash). */
export function scoreMediaUrl(url?: string | null): number {
  if (!url?.trim()) return -1;
  const value = url.trim().toLowerCase();
  if (!isAbsoluteMediaUrl(value)) return -1;
  if (value.includes('r2.dev') || value.includes('cloudflarestorage.com')) {
    return 100;
  }
  if (value.includes('unsplash.com') || value.includes('picsum.photos')) {
    return 10;
  }
  return 50;
}

/**
 * Pick the best product image URL from a list (R2 > other https > nothing).
 */
export function pickPreferredMediaUrl(
  urls: Array<string | null | undefined>,
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const url of urls) {
    const score = scoreMediaUrl(url);
    if (score > bestScore) {
      bestScore = score;
      best = url!.trim();
    }
  }
  return best;
}

/**
 * Normalize a stored media reference for API responses.
 * - HTTPS/HTTP → return as-is (optionally cache-busted)
 * - legacy /assets → null (caller should migrate; never leak to clients)
 * - empty → null
 */
export function normalizeMediaUrl(
  url?: string | null,
  options?: { updatedAt?: Date | string | null; allowPlaceholder?: boolean },
): string | null {
  if (!url?.trim()) {
    return options?.allowPlaceholder ? TRANSPARENT_GIF : null;
  }

  const trimmed = url.trim();

  if (isAbsoluteMediaUrl(trimmed)) {
    if (!options?.updatedAt) return trimmed;
    const stamp =
      options.updatedAt instanceof Date
        ? options.updatedAt.getTime()
        : new Date(options.updatedAt).getTime();
    if (!Number.isFinite(stamp)) return trimmed;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}v=${stamp}`;
  }

  // Never expose legacy local asset paths to the Customer App.
  if (isLegacyAssetPath(trimmed)) {
    return null;
  }

  return options?.allowPlaceholder ? TRANSPARENT_GIF : null;
}

export function normalizeMediaUrlList(
  urls: Array<string | null | undefined>,
  options?: { updatedAt?: Date | string | null },
): string[] {
  return urls
    .map((url) => normalizeMediaUrl(url, options))
    .filter((url): url is string => Boolean(url));
}
