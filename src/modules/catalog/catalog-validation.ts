import { BadRequestException } from '@nestjs/common';
import {
  BRICK_GRADE_VALUES,
  BRICK_PRODUCT_TYPE_VALUES,
  normalizeBrickGrade,
  normalizeBrickProductType,
  type BrickGrade,
  type BrickProductType,
} from './catalog.constants';

export type CatalogAttributeInput = {
  categorySlug?: string | null;
  productType?: string | null;
  grade?: string | null;
};

export type NormalizedCatalogAttributes = {
  productType: BrickProductType | string | null;
  grade: BrickGrade | string | null;
};

/**
 * Validates brick-specific attributes. For other categories, productType/grade
 * are optional free-form values (e.g. RMC M25).
 */
export function validateAndNormalizeCatalogAttributes(
  input: CatalogAttributeInput,
): NormalizedCatalogAttributes {
  const slug = input.categorySlug?.toLowerCase() ?? null;
  const isBricks = slug === 'bricks';

  if (!isBricks) {
    return {
      productType: input.productType?.trim() || null,
      grade: input.grade?.trim() || null,
    };
  }

  const productType = normalizeBrickProductType(input.productType);
  if (!productType) {
    throw new BadRequestException(
      `Brick products require productType: ${BRICK_PRODUCT_TYPE_VALUES.join(' | ')}`,
    );
  }

  const grade = normalizeBrickGrade(input.grade);
  if (!grade) {
    throw new BadRequestException(
      `Brick products require grade: ${BRICK_GRADE_VALUES.join(' | ')}`,
    );
  }

  return { productType, grade };
}
