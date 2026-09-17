import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single selectable value inside a category (brand, subcategory, grade…).
 * Every entry is derived from live product rows — nothing is seeded from a
 * static list, so a brand appears the moment Admin publishes a product for it
 * and disappears when the last product is unpublished.
 */
export class CategoryFacetValueDto {
  @ApiProperty({
    example: 'UltraTech',
    description: 'Value to send back as a filter query param',
  })
  value!: string;

  @ApiProperty({
    example: 'UltraTech',
    description: 'Customer-facing label',
  })
  label!: string;

  @ApiProperty({ example: 5 })
  productCount!: number;

  @ApiPropertyOptional({
    description: 'Brand logo / subcategory image (R2 URL). Null when unset.',
  })
  imageUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Category UUID — present on subcategory facets only',
  })
  id?: string;
}

export class CategoryFacetsCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'cement' })
  slug!: string;

  @ApiProperty({ example: 'Cement' })
  name!: string;

  @ApiPropertyOptional({ example: 'सीमेंट' })
  nameHi?: string | null;

  @ApiPropertyOptional()
  imageUrl?: string | null;
}

export class CategoryPriceRangeDto {
  @ApiProperty({ example: 255 })
  min!: number;

  @ApiProperty({ example: 1150 })
  max!: number;
}

export class CategoryFacetsResponseDto {
  @ApiProperty({ type: CategoryFacetsCategoryDto })
  category!: CategoryFacetsCategoryDto;

  @ApiProperty({
    example: 24,
    description: 'Total visible products in this category (incl. subcategories)',
  })
  totalProducts!: number;

  @ApiProperty({
    type: [CategoryFacetValueDto],
    description:
      'Child categories that currently hold products. `value` = slug.',
  })
  subcategories!: CategoryFacetValueDto[];

  @ApiProperty({
    type: [CategoryFacetValueDto],
    description:
      'Distinct brands across the category. `value` maps to the `brand` query param.',
  })
  brands!: CategoryFacetValueDto[];

  @ApiProperty({ type: [CategoryFacetValueDto] })
  productTypes!: CategoryFacetValueDto[];

  @ApiProperty({ type: [CategoryFacetValueDto] })
  grades!: CategoryFacetValueDto[];

  @ApiPropertyOptional({ type: CategoryPriceRangeDto })
  priceRange?: CategoryPriceRangeDto | null;
}
