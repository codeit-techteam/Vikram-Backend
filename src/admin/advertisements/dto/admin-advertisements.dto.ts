import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RedirectType } from '../../../../generated/prisma/client';

export class CreateAdvertisementDto {
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiProperty() @IsString() brandName!: string;
  @ApiProperty() @IsString() imageUrl!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() buttonText?: string;
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

export class UpdateAdvertisementDto extends PartialType(
  CreateAdvertisementDto,
) {}

export class ReorderItemsDto {
  @ApiProperty({ type: 'array' })
  items!: Array<{ id: string; displayOrder: number }>;
}
