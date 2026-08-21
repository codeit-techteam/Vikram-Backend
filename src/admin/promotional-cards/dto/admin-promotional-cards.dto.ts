import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RedirectType } from '../../../../generated/prisma/client';

export class CreatePromotionalCardDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiProperty({
    description:
      'EMERGENCY_DELIVERY | BULK_PROCUREMENT | MEMBERSHIP | PRIORITY_EXPRESS | EMERGENCY_BANNER | OFFER_FOR_YOU | FEATURED_COLLECTION',
  })
  @IsString()
  cardType!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() buttonText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() badge?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];
  @ApiPropertyOptional({ enum: RedirectType })
  @IsOptional()
  @IsEnum(RedirectType)
  redirectType?: RedirectType;
  @ApiPropertyOptional() @IsOptional() @IsString() redirectId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePromotionalCardDto extends PartialType(
  CreatePromotionalCardDto,
) {}
