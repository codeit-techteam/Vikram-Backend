import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ProductListingType } from '../../../../generated/prisma/client';

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'cement',
    description: 'Filter by category slug',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Filter by category UUID (includes child subcategory products)',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'cement',
    description: 'Alias for category (category slug)',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({
    example: 'ultratech',
    description: 'Full-text search across name, brand, SKU',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @ApiPropertyOptional({
    example: 'price',
    description: 'Sort field: price | name | sales | createdAt | displayOrder',
  })
  @IsOptional()
  @IsString()
  declare sortBy?: string;

  @ApiPropertyOptional({ description: 'Return only featured products' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Return only best-selling products' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  bestSelling?: boolean;

  @ApiPropertyOptional({
    description:
      'Return only deal/offer products (discount, bulk pricing, or active campaign)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  offers?: boolean;

  @ApiPropertyOptional({
    description:
      'Return recently added products (NEW_ARRIVAL listing type or created within last 30 days). Matches home screen Recently Added rail.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  newArrivals?: boolean;

  @ApiPropertyOptional({ enum: ProductListingType })
  @IsOptional()
  @IsEnum(ProductListingType)
  listingType?: ProductListingType;

  @ApiPropertyOptional({ example: 'ultratech' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '53' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({
    example: 'RED_BRICKS',
    description:
      'Filter by product type code (e.g. RED_BRICKS, GREY_ASH_BRICKS). Aliases: red_bricks, fly_ash_bricks',
  })
  @IsOptional()
  @IsString()
  productType?: string;

  /** Alias for productType (brickType=red_bricks) */
  @ApiPropertyOptional({ example: 'red_bricks', deprecated: true })
  @IsOptional()
  @IsString()
  brickType?: string;

  @ApiPropertyOptional({ example: 'IN STOCK' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Minimum retail price filter' })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum retail price filter' })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Scope available stock to a specific hub inventory',
  })
  @IsOptional()
  @IsString()
  hubId?: string;
}
