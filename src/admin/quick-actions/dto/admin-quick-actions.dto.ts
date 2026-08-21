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

export class CreateQuickActionDto {
  @ApiProperty() @IsString() label!: string;
  @ApiProperty() @IsString() slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iconUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() iconKey?: string;
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
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
}

export class UpdateQuickActionDto extends PartialType(CreateQuickActionDto) {}
