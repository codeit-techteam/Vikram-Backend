import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BannerTargetAudience,
  DeliveryPromotionExhaustedBehavior,
  DeliveryPromotionPlacement,
} from '../../../../generated/prisma/client';

export const DELIVERY_PROMOTION_CTA_TYPES = [
  'NONE',
  'ROUTE',
  'PRODUCT',
  'CATEGORY',
  'OFFER',
  'EXTERNAL',
  'SEARCH',
] as const;

export class CreateDeliveryPromotionDto {
  @ApiProperty({ example: '3 Free Bike Deliveries' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Get 3 FREE Bike deliveries' })
  @IsString()
  @MaxLength(200)
  headline!: string;

  @ApiPropertyOptional({ example: 'on your first three orders' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'FREE DELIVERY' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  badge?: string;

  @ApiPropertyOptional({ example: '{count} FREE Bike {delivery} remaining' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remainingHeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  exhaustedHeadline?: string;

  @ApiPropertyOptional({ enum: DeliveryPromotionExhaustedBehavior })
  @IsOptional()
  @IsEnum(DeliveryPromotionExhaustedBehavior)
  exhaustedBehavior?: DeliveryPromotionExhaustedBehavior;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bannerImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobileBannerImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  desktopBannerImage?: string;

  @ApiPropertyOptional({ enum: DeliveryPromotionPlacement })
  @IsOptional()
  @IsEnum(DeliveryPromotionPlacement)
  placement?: DeliveryPromotionPlacement;

  @ApiPropertyOptional({ enum: BannerTargetAudience })
  @IsOptional()
  @IsEnum(BannerTargetAudience)
  targetAudience?: BannerTargetAudience;

  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'SCHEDULED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 10, description: 'Higher number appears first' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ctaEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaLabel?: string;

  @ApiPropertyOptional({ enum: DELIVERY_PROMOTION_CTA_TYPES })
  @IsOptional()
  @IsString()
  ctaType?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: CreateDeliveryPromotionDto) => dto.ctaEnabled === true)
  @IsString()
  ctaValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateDeliveryPromotionDto extends PartialType(
  CreateDeliveryPromotionDto,
) {}
