import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameHi?: string;
  @ApiProperty() @IsString() slug: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiProperty() @IsString() categoryId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional({
    description: 'Stable product type code (e.g. RED_BRICKS, GREY_ASH_BRICKS)',
    example: 'RED_BRICKS',
  })
  @IsOptional()
  @IsString()
  productType?: string;
  @ApiProperty() @IsNumber() retailPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bulkPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() membershipPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() bulkThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() minOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() maxOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() gst?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isBestSelling?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() listingType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional({
    type: [String],
    description: 'Product image URLs (max 6). First becomes primary.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasVariants?: boolean;
  /** Initial stock to place in Central Warehouse on publish */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStock?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maximumStock?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() retailPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bulkPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() bulkThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() membershipPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() entityStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasVariants?: boolean;
}

export class ProductImageItemDto {
  @ApiProperty({ description: 'Public or signed media URL from R2 upload' })
  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'R2 object key from upload response' })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ enum: ['IMAGE', 'VIDEO'], default: 'IMAGE' })
  @IsOptional()
  @IsEnum(['IMAGE', 'VIDEO'] as const)
  type?: 'IMAGE' | 'VIDEO';
}

export class SetProductImagesDto {
  @ApiProperty({
    type: [ProductImageItemDto],
    description: `Replace product IMAGE gallery (max 6). Does not remove product video.`,
  })
  @IsArray()
  images!: ProductImageItemDto[];
}

export class ReorderProductMediaDto {
  @ApiProperty({
    type: [String],
    description: 'Ordered media IDs (images and/or video)',
  })
  @IsArray()
  @IsString({ each: true })
  mediaIds!: string[];
}

export class SetProductVideoDto {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;
}

export class UpdateStockDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty() @IsString() status: string;
}

export class UpdateInventoryDto {
  @ApiProperty() @IsString() hubId: string;
  @ApiProperty() @IsInt() @Min(0) availableQty: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) reservedQty?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}

export class ProductQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
