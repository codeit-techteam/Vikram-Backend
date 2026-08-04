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
import { BannerType } from '../../../../generated/prisma/client';

export class CreateBannerDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiProperty() @IsString() imageUrl!: string;
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
  @ApiPropertyOptional() @IsOptional() @IsString() linkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkTarget?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryCtaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secondaryLinkTarget?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() placement?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publish?: boolean;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
