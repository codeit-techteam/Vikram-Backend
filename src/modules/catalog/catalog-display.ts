/**
 * Brick / RMC catalog display helpers shared by API mappers.
 */
import {
  displayBrickGrade,
  displayBrickProductType,
  normalizeBrickGrade,
  normalizeBrickProductType,
} from './catalog.constants';

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
