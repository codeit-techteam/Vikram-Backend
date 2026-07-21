import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Delivered order UUID' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ description: 'Product UUID from the order' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'Good quality material' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Delivered on time, packing was solid.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({
    description: 'Image URLs (future upload flow)',
    type: [String],
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  images?: string[];
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  images?: string[];
}

export class ReviewResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  customerId!: string;

  @ApiPropertyOptional()
  customerName?: string | null;

  @ApiProperty()
  rating!: number;

  @ApiPropertyOptional()
  title?: string | null;

  @ApiPropertyOptional()
  comment?: string | null;

  @ApiPropertyOptional({ type: [String] })
  images?: string[] | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ProductReviewsResponseDto {
  @ApiProperty()
  productId!: string;

  @ApiProperty()
  averageRating!: number;

  @ApiProperty()
  reviewCount!: number;

  @ApiProperty({ type: [ReviewResponseDto] })
  items!: ReviewResponseDto[];
}
