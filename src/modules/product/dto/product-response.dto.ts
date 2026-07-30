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
  mrp?: number | null;

  @ApiPropertyOptional()
  discountPercent?: number;

  @ApiPropertyOptional()
  bulkPrice?: number | null;

  @ApiProperty()
  inStock!: boolean;

  @ApiPropertyOptional({ example: 42 })
  stockLeft?: number | null;
}

export class BulkPricingTierDto {
  @ApiProperty({ example: 10 })
  minQty!: number;

  @ApiProperty({ example: 350 })
  price!: number;

  @ApiPropertyOptional({ example: 'Buy 10+' })
  label?: string | null;
}

export class HubInventorySummaryDto {
  @ApiProperty()
  hubId!: string;

  @ApiPropertyOptional()
  hubName?: string | null;

  @ApiProperty()
  availableQty!: number;

  @ApiPropertyOptional()
  variantId?: string | null;
}

export class ProductCategorySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  parentId?: string | null;
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
  brandLogoUrl?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  categorySlug!: string;

  @ApiProperty()
  categoryName!: string;

  @ApiPropertyOptional()
  subcategoryId?: string | null;

  @ApiPropertyOptional()
  subcategorySlug?: string | null;

  @ApiPropertyOptional()
  subcategoryName?: string | null;

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

  @ApiProperty({ description: 'Retail / current selling price' })
  retailPrice!: number;

  @ApiProperty({ description: 'Alias for retailPrice' })
  price!: number;

  @ApiPropertyOptional({ description: 'Maximum retail price (MRP)' })
  mrp?: number | null;

  @ApiPropertyOptional({ example: 22, description: 'Discount % vs MRP' })
  discountPercent?: number;

  @ApiProperty({ example: 18, description: 'GST percentage' })
  gst!: number;

  @ApiPropertyOptional({ description: 'Primary / thumbnail image URL' })
  thumbnail?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Gallery image URLs' })
  gallery?: string[];

  @ApiPropertyOptional()
  bulkPrice?: number | null;

  @ApiProperty()
  bulkThreshold!: number;

  @ApiPropertyOptional()
  bulkLabel?: string | null;

  @ApiPropertyOptional({ type: [BulkPricingTierDto] })
  bulkPricing?: BulkPricingTierDto[];

  @ApiProperty()
  minOrder!: number;

  @ApiPropertyOptional()
  maxOrder?: number | null;

  @ApiProperty()
  incrementStep!: number;

  @ApiProperty()
  defaultQuantity!: number;

  @ApiProperty()
  hasVariants!: boolean;

  @ApiPropertyOptional()
  defaultVariantId?: string | null;

  @ApiProperty({ example: 0 })
  variantCount!: number;

  @ApiPropertyOptional()
  perPiecePrice?: number | null;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty()
  isBestSelling!: boolean;

  @ApiProperty()
  isBestseller!: boolean;

  @ApiProperty()
  isNewArrival!: boolean;

  @ApiPropertyOptional()
  deliveryEligible?: boolean;

  @ApiPropertyOptional({ example: 4.5 })
  averageRating?: number;

  @ApiPropertyOptional({ example: 128 })
  reviewCount?: number;

  @ApiPropertyOptional()
  rating?: number;

  @ApiPropertyOptional()
  specs?: Record<string, string> | null;

  @ApiPropertyOptional({ type: [ProductImageResponseDto] })
  images?: ProductImageResponseDto[];

  @ApiPropertyOptional({ type: [ProductVariantResponseDto] })
  variants?: ProductVariantResponseDto[];

  /** Alias used by client apps that expect variantList */
  @ApiPropertyOptional({ type: [ProductVariantResponseDto] })
  variantList?: ProductVariantResponseDto[];

  @ApiPropertyOptional({ example: 'Delivery in 22 mins' })
  deliveryMessage?: string;

  @ApiPropertyOptional({ type: [ProductResponseDto] })
  relatedProducts?: ProductResponseDto[];

  @ApiPropertyOptional({ example: 120 })
  stockLeft?: number;

  @ApiPropertyOptional({ example: 'Available stock remaining' })
  availableStock?: number;

  @ApiPropertyOptional({ example: '35 mins' })
  deliveryETA?: string;

  @ApiPropertyOptional({ example: 35 })
  estimatedDeliveryMinutes?: number | null;

  @ApiPropertyOptional({ example: 403.75 })
  membershipPrice?: number | null;

  @ApiPropertyOptional({ example: true })
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
