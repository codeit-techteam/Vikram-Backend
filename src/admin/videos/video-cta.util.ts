const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VideoLinkType =
  | 'PRODUCT'
  | 'CATEGORY'
  | 'ROUTE'
  | 'EXTERNAL'
  | 'OFFER'
  | 'BULK_INQUIRY'
  | 'LOYALTY';

export function inferVideoLinkType(
  linkType?: string | null,
  linkUrl?: string | null,
  linkTarget?: string | null,
): VideoLinkType | null {
  const target = (linkTarget || linkUrl || '').trim();
  const explicit = (linkType || '').trim().toUpperCase();

  // Heal legacy Admin paths that were stored as ROUTE.
  if (/^\/category\//i.test(target)) return 'CATEGORY';
  if (/^\/products\//i.test(target)) return 'PRODUCT';
  if (/^\/offers\//i.test(target)) return 'OFFER';
  if (/^https?:\/\//i.test(target)) return 'EXTERNAL';

  if (
    explicit === 'PRODUCT' ||
    explicit === 'CATEGORY' ||
    explicit === 'ROUTE' ||
    explicit === 'EXTERNAL' ||
    explicit === 'OFFER' ||
    explicit === 'BULK_INQUIRY' ||
    explicit === 'LOYALTY'
  ) {
    return explicit;
  }

  if (!target) return null;
  if (UUID_RE.test(target)) return 'PRODUCT';
  if (target.startsWith('/')) return 'ROUTE';
  return 'PRODUCT';
}

export function normalizeVideoLinkTarget(
  linkType: VideoLinkType | null,
  linkUrl?: string | null,
  linkTarget?: string | null,
): string | null {
  const raw = (linkTarget || linkUrl || '').trim();
  if (!raw) return null;

  if (linkType === 'CATEGORY') {
    const match = raw.match(/^\/category\/([^/?#]+)/i);
    if (match?.[1]) return match[1];
  }
  if (linkType === 'PRODUCT') {
    const match = raw.match(/^\/products\/(?:detail\/)?([^/?#]+)/i);
    if (match?.[1]) return match[1];
  }
  if (linkType === 'OFFER') {
    const match = raw.match(/^\/offers\/([^/?#]+)/i);
    if (match?.[1]) return match[1];
  }
  return raw;
}

export function resolveVideoCta(fields: {
  linkType?: string | null;
  linkUrl?: string | null;
  linkTarget?: string | null;
}): {
  linkType: VideoLinkType | null;
  linkUrl: string | null;
  linkTarget: string | null;
} {
  const linkType = inferVideoLinkType(
    fields.linkType,
    fields.linkUrl,
    fields.linkTarget,
  );
  const linkTarget = normalizeVideoLinkTarget(
    linkType,
    fields.linkUrl,
    fields.linkTarget,
  );
  return {
    linkType,
    linkUrl: linkTarget,
    linkTarget,
  };
}
