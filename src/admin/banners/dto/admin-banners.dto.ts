import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BannerPlacement,
  BannerTargetAudience,
  BannerType,
} from '../../../../generated/prisma/client';

const CTA_LINK_TYPES = [
  'ROUTE',
  'PRODUCT',
  'CATEGORY',
  'OFFER',
  'SEARCH',
  'MEMBERSHIP',
  'BULK_INQUIRY',
  'MATERIAL_EXPERT',
  'EXTERNAL',
  'WHATSAPP',
  'BRAND',
] as const;

export class CreateBannerDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({
    description:
      'HOME_HERO: full-bleed home carousel artwork. HOME_PROMO: product or illustration on the right of the composed card.',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tabletUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() desktopUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thumbnailUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() badge?: string;
  @ApiPropertyOptional({ enum: BannerType })
  @IsOptional()
  @IsEnum(BannerType)
  bannerType?: BannerType;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backgroundColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() buttonAction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkUrl?: string;
  @ApiPropertyOptional({ enum: CTA_LINK_TYPES })
  @IsOptional()
  @IsString()
  linkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkTarget?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryCtaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkTarget?: string;
  @ApiPropertyOptional({ enum: BannerPlacement })
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;
  @ApiPropertyOptional({ enum: BannerTargetAudience })
  @IsOptional()
  @IsEnum(BannerTargetAudience)
  targetAudience?: BannerTargetAudience;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publish?: boolean;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
