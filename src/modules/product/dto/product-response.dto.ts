import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductImageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Image URL (imageUrl alias)' })
  url!: string;

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiPropertyOptional()
  altText?: string | null;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  displayOrder!: number;
}

export class ProductVariantResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional()
  displayUnit?: string | null;

  @ApiPropertyOptional()
  size?: number | null;

  @ApiPropertyOptional()
  sizeUnit?: string | null;

  @ApiProperty()
  price!: number;

  @ApiPropertyOptional()
  bulkPrice?: number | null;

  @ApiProperty()
  inStock!: boolean;
}

export class ProductCategorySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;
}

export class ProductResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  nameHi?: string | null;

  @ApiPropertyOptional()
  detailName?: string | null;

  @ApiPropertyOptional()
  brand?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  categorySlug!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiPropertyOptional({ type: ProductCategorySummaryDto })
  category?: ProductCategorySummaryDto;

  @ApiPropertyOptional()
  grade?: string | null;

  @ApiPropertyOptional()
  badge?: string | null;

  @ApiPropertyOptional()
  badgeColor?: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  spec?: string | null;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ description: 'Retail price (alias: price)' })
  retailPrice!: number;

  @ApiProperty({ description: 'Alias for retailPrice' })
  price!: number;

  @ApiProperty({ example: 18, description: 'GST percentage' })
  gst!: number;

  @ApiPropertyOptional({ description: 'Primary / thumbnail image URL' })
  thumbnail?: string | null;

  @ApiPropertyOptional()
  bulkPrice?: number | null;

  @ApiProperty()
  bulkThreshold!: number;

  @ApiPropertyOptional()
  bulkLabel?: string | null;

  @ApiProperty()
  minOrder!: number;

  @ApiPropertyOptional()
  maxOrder?: number | null;

  @ApiProperty()
  hasVariants!: boolean;

  @ApiPropertyOptional()
  defaultVariantId?: string | null;

  @ApiPropertyOptional()
  perPiecePrice?: number | null;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty()
  isBestSelling!: boolean;

  @ApiPropertyOptional()
  specs?: Record<string, string> | null;

  @ApiPropertyOptional({ type: [ProductImageResponseDto] })
  images?: ProductImageResponseDto[];

  @ApiPropertyOptional({ type: [ProductVariantResponseDto] })
  variants?: ProductVariantResponseDto[];

  @ApiPropertyOptional({ type: [ProductResponseDto] })
  relatedProducts?: ProductResponseDto[];

  @ApiPropertyOptional({ example: 120, description: 'Total available stock across hubs' })
  stockLeft?: number;

  @ApiPropertyOptional({ example: '1-2 days', description: 'Estimated delivery time' })
  deliveryETA?: string;

  @ApiPropertyOptional({ example: 403.75, description: 'Member-exclusive price' })
  membershipPrice?: number | null;

  @ApiPropertyOptional({ example: true, description: 'Whether bulk ordering is available' })
  isBulkAvailable?: boolean;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items!: ProductResponseDto[];

  @ApiProperty()
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
