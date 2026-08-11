import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BulkDeliveryRequirement,
  BulkEnquiryStatus,
  BulkFollowUpStatus,
  BulkQuotationStatus,
} from '../../../../generated/prisma/client';

export class BulkQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Search enquiryNumber, company, customer name/phone, material, executive',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BulkEnquiryStatus })
  @IsOptional()
  @IsEnum(BulkEnquiryStatus)
  status?: BulkEnquiryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  materialCategorySlug?: string;

  @ApiPropertyOptional({ enum: BulkDeliveryRequirement })
  @IsOptional()
  @IsEnum(BulkDeliveryRequirement)
  deliveryRequirement?: BulkDeliveryRequirement;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedExecutiveId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class UpdateBulkStatusDto {
  @ApiProperty({ enum: BulkEnquiryStatus })
  @IsEnum(BulkEnquiryStatus)
  status!: BulkEnquiryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class AssignExecutiveDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Preferred: AdminUser id of the executive',
  })
  @IsOptional()
  @IsUUID()
  executiveId?: string;

  @ApiPropertyOptional({
    description: 'Legacy: assign by display name when executiveId missing',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedExecutive?: string;
}

export class AddBulkFollowUpDto {
  @ApiProperty({ example: '2026-08-12T10:00:00.000Z' })
  @IsDateString()
  followUpAt!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class UpdateBulkFollowUpStatusDto {
  @ApiProperty({ enum: BulkFollowUpStatus })
  @IsEnum(BulkFollowUpStatus)
  status!: BulkFollowUpStatus;
}

export class AddBulkInternalNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class CreateBulkQuotationDto {
  @ApiProperty({ example: 'OPC 53 Cement — 500 Bags' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  materialLabel!: string;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ example: 'Bags' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit!: string;

  @ApiProperty({ example: 380 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ example: 1500, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryCharge?: number;

  @ApiPropertyOptional({ example: 18, default: 18 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  gstPercent?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: '2026-08-20T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class UpdateBulkQuotationStatusDto {
  @ApiProperty({ enum: BulkQuotationStatus })
  @IsEnum(BulkQuotationStatus)
  status!: BulkQuotationStatus;
}

export class ConvertBulkToOrderDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Accepted quotation to convert from',
  })
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when quotationId is not provided / not accepted',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RejectBulkEnquiryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

/** @deprecated Prefer CreateBulkQuotationDto */
export class BulkQuotationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}
