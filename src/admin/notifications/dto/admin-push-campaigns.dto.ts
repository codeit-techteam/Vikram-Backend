import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const PUSH_AUDIENCE_TYPES = [
  'ALL',
  'CITY_HUB',
  'SEGMENT',
  'CUSTOM_LIST',
] as const;

export const PUSH_DEEP_LINK_TARGETS = [
  'HOME',
  'PRODUCT',
  'CATEGORY',
  'OFFER',
  'ORDER',
  'CART',
  'NOTIFICATIONS',
  'CUSTOM',
] as const;

export const PUSH_DELIVERY_MODES = ['NOW', 'SCHEDULED'] as const;

export const PUSH_USER_SEGMENTS = [
  'NEW_CUSTOMERS',
  'EXISTING_CUSTOMERS',
  'ACTIVE',
  'DORMANT',
  'MEMBERS',
  'INDIVIDUALS',
  'CONTRACTORS',
  'MASONS',
  'INTERIOR_DESIGNERS',
  'ARCHITECTS',
  'BUILDERS',
  'DEVELOPERS',
] as const;

function toUpper(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreatePushCampaignDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title!: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

  @ApiProperty({ enum: PUSH_AUDIENCE_TYPES })
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_AUDIENCE_TYPES)
  audienceType!: (typeof PUSH_AUDIENCE_TYPES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  hubIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  cities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  segments?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  customerIds?: string[];

  @ApiProperty({ enum: PUSH_DEEP_LINK_TARGETS })
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_DEEP_LINK_TARGETS)
  deepLinkTarget!: (typeof PUSH_DEEP_LINK_TARGETS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLinkValue?: string;

  @ApiProperty({ enum: PUSH_DELIVERY_MODES })
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_DELIVERY_MODES)
  deliveryMode!: (typeof PUSH_DELIVERY_MODES)[number];

  @ApiPropertyOptional()
  @ValidateIf((dto: CreatePushCampaignDto) => dto.deliveryMode === 'SCHEDULED')
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Save without sending' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class UpdatePushCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @ApiPropertyOptional({ enum: PUSH_AUDIENCE_TYPES })
  @IsOptional()
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_AUDIENCE_TYPES)
  audienceType?: (typeof PUSH_AUDIENCE_TYPES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  hubIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  cities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  segments?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customerIds?: string[];

  @ApiPropertyOptional({ enum: PUSH_DEEP_LINK_TARGETS })
  @IsOptional()
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_DEEP_LINK_TARGETS)
  deepLinkTarget?: (typeof PUSH_DEEP_LINK_TARGETS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deepLinkValue?: string;

  @ApiPropertyOptional({ enum: PUSH_DELIVERY_MODES })
  @IsOptional()
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_DELIVERY_MODES)
  deliveryMode?: (typeof PUSH_DELIVERY_MODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class PushCampaignQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class RegisterAdminDeviceTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class SendTestPushDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title!: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toUpper(value))
  @IsIn(PUSH_DEEP_LINK_TARGETS)
  deepLinkTarget?: (typeof PUSH_DEEP_LINK_TARGETS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deepLinkValue?: string;
}
