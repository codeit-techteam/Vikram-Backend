/**
 * Brick / RMC catalog display helpers shared by API mappers.
 */
import {
  displayBrickGrade,
  displayBrickProductType,
  normalizeBrickGrade,
  normalizeBrickProductType,
} from './catalog.constants';

/** Canonical RMC volume unit (IndiaMART / trade traditional). */
export const RMC_UNIT = 'Cubic Meter';

const CUBIC_METER_ALIASES = new Set([
  'cum',
  'cu.m',
  'cu.m.',
  'cu m',
  'm3',
  'm³',
  'cubic meter',
  'cubic meters',
  'cubic metre',
  'cubic metres',
]);

export function isCubicMeterUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return CUBIC_METER_ALIASES.has(unit.trim().toLowerCase());
}

/** Normalize Cum / Cubic Metres / m³ → Cubic Meter so catalog stays in sync. */
export function normalizeCatalogUnit(unit?: string | null): string {
  if (!unit?.trim()) return '';
  if (isCubicMeterUnit(unit)) return RMC_UNIT;
  return unit.trim();
}

export function normalizeBulkLabel(label?: string | null): string | null {
  if (label == null) return null;
  if (!label.trim()) return '';
  return label
    .replace(/\bCum\b/gi, RMC_UNIT)
    .replace(/\bCubic Metres?\b/gi, RMC_UNIT)
    .trim();
}

export function formatProductDisplayName(params: {
  name: string;
  productType?: string | null;
  grade?: string | null;
}): string {
  return params.name;
}

export function mapCatalogAttributes(params: {
  productType?: string | null;
  grade?: string | null;
  categorySlug?: string | null;
}) {
  const productTypeCode = normalizeBrickProductType(params.productType);
  const gradeCode = normalizeBrickGrade(params.grade);

  return {
    productType: params.productType ?? null,
    productTypeCode,
    productTypeLabel: displayBrickProductType(params.productType),
    grade: params.grade ?? null,
    gradeCode,
    gradeLabel: displayBrickGrade(params.grade),
    searchAliases:
      productTypeCode === 'GREY_ASH_BRICKS'
        ? ['Fly Ash Bricks', 'Grey Ash Bricks', 'Fly Ash']
        : productTypeCode === 'RED_BRICKS'
          ? ['Red Bricks']
          : params.categorySlug === 'rmc'
            ? ['RMC', 'Ready Mix Concrete']
            : [],
  };
}
