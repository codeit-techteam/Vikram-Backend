/** Suggested attribute names for Admin UI. Not a closed business list. */
export const SUGGESTED_VARIANT_ATTRIBUTES = [
  'Size',
  'Weight',
  'Volume',
  'Pack',
  'Dimensions',
  'Length',
  'Color',
  'Grade',
  'Model',
  'Capacity',
  'Material',
  'Finish',
  'Custom',
] as const;

export type SuggestedVariantAttribute =
  (typeof SUGGESTED_VARIANT_ATTRIBUTES)[number];

/** Kept for callers that still import the old name. */
export const PRODUCT_VARIANT_ATTRIBUTES = SUGGESTED_VARIANT_ATTRIBUTES;
export type ProductVariantAttribute = SuggestedVariantAttribute;

/** Attributes that typically need a unit (ml, kg, ft, m). Others may omit it. */
const UNIT_REQUIRED_ATTRIBUTES = new Set([
  'Size',
  'Weight',
  'Volume',
  'Length',
  'Dimensions',
  'Capacity',
  'Pack',
]);

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;

export type VariantAttributesMap = Record<string, string>;

export function isSuggestedVariantAttribute(
  value: string | null | undefined,
): value is SuggestedVariantAttribute {
  return (
    typeof value === 'string' &&
    (SUGGESTED_VARIANT_ATTRIBUTES as readonly string[]).includes(value)
  );
}

/** @deprecated Use isSuggestedVariantAttribute */
export function isVariantAttribute(
  value: string | null | undefined,
): value is ProductVariantAttribute {
  return isSuggestedVariantAttribute(value);
}

export function isUnitRequiredForAttribute(attribute: string): boolean {
  return UNIT_REQUIRED_ATTRIBUTES.has(attribute.trim());
}

export function resolveAttributeName(
  attribute: string,
  customName?: string | null,
): string {
  const trimmed = attribute.trim();
  if (!trimmed) {
    throw new Error('Variant attribute is required');
  }
  if (trimmed.toLowerCase() === 'custom') {
    const custom = customName?.trim();
    if (!custom) {
      throw new Error('Enter a custom attribute name');
    }
    return custom;
  }
  return trimmed;
}

export function normalizeAttributesMap(
  attributes: VariantAttributesMap | null | undefined,
  attribute?: string | null,
  value?: string | null,
): VariantAttributesMap {
  if (attributes && Object.keys(attributes).length > 0) {
    const normalized: VariantAttributesMap = {};
    for (const [key, raw] of Object.entries(attributes)) {
      const name = key.trim();
      const val = String(raw ?? '').trim();
      if (name && val) normalized[name] = val;
    }
    if (Object.keys(normalized).length > 0) return normalized;
  }
  const name = attribute?.trim();
  const val = value?.trim();
  if (name && val) return { [name]: val };
  return {};
}

export function primaryAttributeEntry(
  attributes: VariantAttributesMap,
): { name: string; value: string } | null {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;
  const [name, value] = entries[0];
  return { name, value };
}

export function buildVariantLabel(
  value: string,
  unit?: string | null,
): string {
  return [value.trim(), unit?.trim()].filter(Boolean).join(' ').trim();
}

export function labelFromAttributes(
  attributes: VariantAttributesMap,
  unit?: string | null,
): string {
  const values = Object.values(attributes).filter(Boolean);
  const combo = values.join(' / ');
  return buildVariantLabel(combo, unit);
}

export function normalizeVariantSku(
  sku?: string | null,
): string | null {
  const trimmed = sku?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function isValidVariantSku(sku: string): boolean {
  return SKU_PATTERN.test(sku);
}

/** Unique key for a variant combination within a product (multi-attribute safe). */
export function variantCombinationKey(
  attributes: VariantAttributesMap,
  unit?: string | null,
): string {
  const parts = Object.entries(attributes)
    .map(([key, value]) => `${key.trim().toLowerCase()}=${value.trim().toLowerCase()}`)
    .sort();
  parts.push(`unit=${(unit ?? '').trim().toLowerCase()}`);
  return parts.join('|');
}

/** @deprecated Use variantCombinationKey with an attributes map */
export function variantIdentityKey(
  value: string,
  unit?: string | null,
): string {
  return variantCombinationKey({ value }, unit);
}
