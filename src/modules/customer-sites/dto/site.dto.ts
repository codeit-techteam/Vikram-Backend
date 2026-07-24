import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SiteType } from '../../../../generated/prisma/client';

export class CreateSiteDto {
  @ApiProperty({ example: 'Skyline Tower' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  siteName!: string;

  @ApiPropertyOptional({ enum: SiteType, example: SiteType.CONSTRUCTION_SITE })
  @IsOptional()
  @IsEnum(SiteType)
  siteType?: SiteType;

  @ApiPropertyOptional({ example: 'Vikram Malhotra' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactPerson?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: '74, B14 Block B, Kalyani' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  fullAddress!: string;

  @ApiPropertyOptional({ example: 'Near City Mall' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional({ example: 'Gate 4' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gateNumber?: string;

  @ApiPropertyOptional({ example: 'Ground Floor' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  floor?: string;

  @ApiProperty({ example: 'Kalyani' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'West Bengal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiPropertyOptional({ example: 'India', default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiProperty({ example: '741235' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  pincode!: string;

  @ApiProperty({ example: 22.9607 })
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 88.4339 })
  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ example: 'Call site manager 15 mins before arrival' })
  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateSiteDto {
  @ApiPropertyOptional({ example: 'Skyline Tower' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  siteName?: string;

  @ApiPropertyOptional({ enum: SiteType })
  @IsOptional()
  @IsEnum(SiteType)
  siteType?: SiteType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  fullAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class SiteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty({ example: 'Skyline Tower' })
  siteName!: string;

  @ApiPropertyOptional({ enum: SiteType })
  siteType?: SiteType | null;

  @ApiPropertyOptional()
  contactPerson?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty()
  fullAddress!: string;

  @ApiPropertyOptional()
  landmark?: string | null;

  @ApiPropertyOptional()
  gateNumber?: string | null;

  @ApiPropertyOptional()
  floor?: string | null;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  pincode!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiPropertyOptional()
  deliveryNotes?: string | null;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Orders delivered to this site (admin)' })
  ordersDelivered?: number;
}
