import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({
    example: 'Size',
    description:
      'Attribute name (Size, Weight, Color, Dimensions, or any admin-defined name). Use Custom + customAttribute to invent a new name.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  attribute!: string;

  @ApiPropertyOptional({
    example: 'Finish',
    description: 'Required when attribute is Custom. Becomes the stored attribute name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customAttribute?: string;

  @ApiPropertyOptional({
    example: { Size: '250' },
    description:
      'Full attribute map for this variant. Supports future combinations such as { Color: "Red", Size: "M" }.',
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiProperty({ example: '250' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  value!: string;

  @ApiPropertyOptional({ example: 'ml' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ example: 'VAR-250' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/, {
    message: 'SKU must be 2–80 characters: letters, numbers, dot, underscore, hyphen',
  })
  sku?: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) price!: number;

  @ApiPropertyOptional({ example: 173 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: 280 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bulkPrice?: number;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ example: 'Weight' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  attribute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customAttribute?: string;

  @ApiPropertyOptional({ example: { Weight: '50' } })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/, {
    message: 'SKU must be 2–80 characters: letters, numbers, dot, underscore, hyphen',
  })
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bulkPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateProductVariantStatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class ReorderProductVariantsDto {
  @ApiProperty({ type: [String], description: 'Variant IDs in desired display order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  variantIds!: string[];
}
