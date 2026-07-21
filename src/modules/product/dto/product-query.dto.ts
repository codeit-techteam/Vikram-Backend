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
}
