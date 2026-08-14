import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  IsDateString,
  IsArray,
  IsEnum,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OfferTargetAudience } from '../../../../generated/prisma/client';

export class CreateOfferDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobileImageUrl?: string;
  @ApiPropertyOptional({ enum: ['PERCENTAGE', 'FLAT', 'BUNDLE', 'BULK'] })
  @IsOptional()
  @IsString()
  offerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountLabel?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  bundlePrice?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() originalPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) badge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) ctaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) ctaAction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) ctaValue?: string;
  @ApiPropertyOptional({ enum: OfferTargetAudience })
  @IsOptional()
  @IsEnum(OfferTargetAudience)
  targetAudience?: OfferTargetAudience;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10) priority?: number;
}

export class UpdateOfferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobileImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() offerType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountLabel?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  bundlePrice?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() originalPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() badge?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaAction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ctaValue?: string;
  @ApiPropertyOptional({ enum: OfferTargetAudience })
  @IsOptional()
  @IsEnum(OfferTargetAudience)
  targetAudience?: OfferTargetAudience;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10) priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
}

export class OfferQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() placement?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() limit?: number = 20;
}

export class SetOfferProductsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}
