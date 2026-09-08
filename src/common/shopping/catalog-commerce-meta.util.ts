/** Admin catalog unit/variant snapshot stored inside product.description. */

export type CatalogCommerceVariantMeta = {
  value: string;
  unit: string;
  sku?: string;
  mrp: number;
  price: number;
  stock: number;
  isActive: boolean;
};

export type CatalogCommerceMeta = {
  unit: string;
  hasVariants?: boolean;
  variantAttribute?: string;
  customAttributeName?: string;
  variants?: CatalogCommerceVariantMeta[];
};

const META_COMMENT = /<!--\s*bw-catalog-meta:([\s\S]*?)-->/gi;
const META_ATTR_DQ = /<p[^>]*data-bw-catalog-meta="([^"]+)"[^>]*>\s*<\/p>/gi;
const META_ATTR_SQ = /<p[^>]*data-bw-catalog-meta='([^']+)'[^>]*>\s*<\/p>/gi;
const META_ATTR_ENTITY =
  /<p[^>]*data-bw-catalog-meta=(?:&quot;|&#34;|&#x22;)([\s\S]*?)(?:&quot;|&#34;|&#x22;)[^>]*>\s*<\/p>/gi;
const ENCODED_JSON_BLOB = /%7B%22(?:unit|hasVariants|variants)%22[\s\S]*?%7D/gi;
const OPEN_COMMENT = /<!--\s*bw-catalog-meta:[\s\S]*/i;
const ENTITY_COMMENT = /&lt;!--\s*bw-catalog-meta:[\s\S]*?(?:--&gt;|-->)/gi;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function tryParseMetaJson(raw: string): CatalogCommerceMeta | null {
  const candidates = [raw.trim()];
  try {
    candidates.push(decodeURIComponent(raw.trim()));
  } catch {
    /* ignore malformed URI sequences */
  }
  try {
    candidates.push(decodeURIComponent(decodeURIComponent(raw.trim())));
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as CatalogCommerceMeta;
      if (parsed && typeof parsed.unit === 'string' && parsed.unit.trim()) {
        return {
          ...parsed,
          unit: parsed.unit.trim(),
          variants: Array.isArray(parsed.variants)
            ? parsed.variants.map((row) => ({
                value: String(row?.value ?? '').trim(),
                unit: String(row?.unit ?? '').trim(),
                sku: row?.sku ? String(row.sku).trim() : undefined,
                mrp: Number(row?.mrp) || 0,
                price: Number(row?.price) || 0,
                stock: Math.max(0, Math.floor(Number(row?.stock) || 0)),
                isActive: row?.isActive !== false,
              }))
            : parsed.variants,
        };
      }
    } catch {
      /* try next encoding */
    }
  }
  return null;
}

function collectEncodedPayloads(description: string): string[] {
  const payloads: string[] = [];
  const decoded = decodeHtmlEntities(description);
  const sources = [description, decoded];
  const patterns = [META_COMMENT, META_ATTR_DQ, META_ATTR_SQ, META_ATTR_ENTITY];

  for (const source of sources) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null = pattern.exec(source);
      while (match) {
        if (match[1]) payloads.push(match[1]);
        match = pattern.exec(source);
      }
    }
  }
  return payloads;
}

export function commerceVariantKey(
  value?: string | null,
  unit?: string | null,
): string {
  return `${String(value ?? '').trim().toLowerCase()}|${String(unit ?? '').trim().toLowerCase()}`;
}

export function parseCatalogCommerceMeta(
  description?: string | null,
): CatalogCommerceMeta | null {
  if (!description) return null;
  for (const payload of collectEncodedPayloads(description)) {
    const parsed = tryParseMetaJson(payload);
    if (parsed) return parsed;
  }

  const blob = description.match(ENCODED_JSON_BLOB)?.[0];
  if (blob) {
    const parsed = tryParseMetaJson(blob);
    if (parsed) return parsed;
  }
  return null;
}

export function stripCatalogCommerceMeta(description?: string | null): string {
  if (!description) return '';
  let next = decodeHtmlEntities(description);
  next = next.replace(ENTITY_COMMENT, '');
  next = next.replace(META_COMMENT, '');
  next = next.replace(META_ATTR_DQ, '');
  next = next.replace(META_ATTR_SQ, '');
  next = next.replace(META_ATTR_ENTITY, '');
  next = next.replace(
    /<p[^>]*data-bw-catalog-meta(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>\s*<\/p>/gi,
    '',
  );
  next = next.replace(ENCODED_JSON_BLOB, '');
  if (OPEN_COMMENT.test(next)) {
    next = next.replace(OPEN_COMMENT, '');
  }
  return next.trim();
}

export function htmlToPlainText(description?: string | null): string {
  if (!description) return '';
  let text = stripCatalogCommerceMeta(description);
  text = decodeHtmlEntities(text);
  text = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<\s*\/li\s*>/gi, '\n')
    .replace(/<\s*\/h[1-6]\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function descriptionLeaksCatalogMeta(
  description?: string | null,
): boolean {
  if (!description) return false;
  return /bw-catalog-meta|data-bw-catalog-meta|%7B%22(?:unit|hasVariants|variants)%22/i.test(
    description,
  );
}

export function customerDescriptionLooksUnsafe(
  description?: string | null,
): boolean {
  if (!description) return false;
  return (
    descriptionLeaksCatalogMeta(description) || /<[a-z][\s\S]*?>/i.test(description)
  );
}

export function attachCatalogCommerceMeta(
  description: string,
  meta: CatalogCommerceMeta,
): string {
  const encoded = encodeURIComponent(JSON.stringify(meta));
  const marker = `<!--bw-catalog-meta:${encoded}--><p data-bw-catalog-meta="${encoded}" hidden></p>`;
  const cleaned = stripCatalogCommerceMeta(description).trimEnd();
  return `${cleaned}${marker}`;
}
