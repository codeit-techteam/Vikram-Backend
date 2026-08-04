import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsInt, IsDateString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOfferDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() slug: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiProperty() @IsString() offerType: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bundlePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() originalPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() badge?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
}

export class UpdateOfferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() discountLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() badge?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() displayOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
}

export class OfferQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() page?: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() limit?: number = 20;
}

export class SetOfferProductsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}
