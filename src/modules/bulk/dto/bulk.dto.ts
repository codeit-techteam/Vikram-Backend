import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
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
  BulkPreferredContact,
  BulkQuotationStatus,
} from '../../../../generated/prisma/client';

export class CreateBulkEnquiryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  materialCategoryId?: string;

  @ApiPropertyOptional({ example: 'cement' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  materialCategorySlug?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  materialCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['cement', 'bricks'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  materialCategorySlugs?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isMixedLoad?: boolean;

  @ApiPropertyOptional({
    example: 'RED_BRICKS',
    description: 'Required when category is bricks',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  productType?: string;

  @ApiPropertyOptional({ example: 'A_PLUS' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @ApiPropertyOptional({ example: 'OPC 53 Grade Cement' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  materialTypeLabel?: string;

  @ApiProperty({ example: 500, description: 'Estimated quantity (> 0, decimals allowed)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  estimatedQuantity!: number;

  @ApiProperty({ example: 'Bags' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit!: string;

  @ApiProperty({ enum: BulkDeliveryRequirement })
  @IsEnum(BulkDeliveryRequirement)
  deliveryRequirement!: BulkDeliveryRequirement;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiProperty({ example: 'Sector 62, Noida, UP' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  location!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalNotes?: string;

  @ApiPropertyOptional({ enum: BulkPreferredContact, default: BulkPreferredContact.BOTH })
  @IsOptional()
  @IsEnum(BulkPreferredContact)
  preferredContact?: BulkPreferredContact;

  @ApiPropertyOptional({ example: 'Green Valley Apartments Phase 2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  siteType?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ example: 'Sharma Constructions Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;
}

export class BulkEnquiryListQueryDto {
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
}

export class BulkCustomerQuotationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  quotationNumber!: string;

  @ApiProperty({ enum: BulkQuotationStatus })
  status!: BulkQuotationStatus;

  @ApiProperty()
  materialLabel!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unit!: string;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  deliveryCharge!: number;

  @ApiProperty()
  gstPercent!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  gstAmount!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  validUntil?: string | null;

  @ApiPropertyOptional()
  sentAt?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class BulkAssignedExecutivePublicDto {
  @ApiProperty()
  name!: string;
}

export class BulkEnquiryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  enquiryNumber!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty()
  projectName!: string;

  @ApiPropertyOptional()
  siteType?: string | null;

  @ApiPropertyOptional()
  expectedStartDate?: string | null;

  @ApiPropertyOptional()
  materialCategoryId?: string | null;

  @ApiPropertyOptional()
  materialCategorySlug?: string | null;

  @ApiPropertyOptional()
  materialCategoryName?: string | null;

  @ApiProperty()
  isMixedLoad!: boolean;

  @ApiPropertyOptional()
  materialCategories?: Array<{ id: string; slug: string; name: string }> | null;

  @ApiPropertyOptional()
  productType?: string | null;

  @ApiPropertyOptional()
  grade?: string | null;

  @ApiPropertyOptional()
  materialTypeLabel?: string | null;

  @ApiProperty()
  expectedQuantity!: number;

  @ApiProperty()
  expectedUnit!: string;

  @ApiPropertyOptional({ enum: BulkDeliveryRequirement })
  deliveryRequirement?: BulkDeliveryRequirement | null;

  @ApiPropertyOptional()
  deliveryDate?: string | null;

  @ApiProperty()
  location!: string;

  @ApiPropertyOptional()
  addressLine?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  state?: string | null;

  @ApiPropertyOptional()
  pincode?: string | null;

  @ApiPropertyOptional()
  latitude?: number | null;

  @ApiPropertyOptional()
  longitude?: number | null;

  @ApiPropertyOptional()
  additionalNotes?: string | null;

  @ApiProperty({ enum: BulkPreferredContact })
  preferredContact!: BulkPreferredContact;

  @ApiProperty({ enum: BulkEnquiryStatus })
  status!: BulkEnquiryStatus;

  @ApiProperty({ description: 'Customer-friendly status label' })
  customerFacingStatus!: string;

  @ApiPropertyOptional({ type: BulkAssignedExecutivePublicDto })
  assignedExecutive?: BulkAssignedExecutivePublicDto | null;

  @ApiPropertyOptional({ type: [BulkCustomerQuotationDto] })
  quotations?: BulkCustomerQuotationDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class BulkEnquiryListResponseDto {
  @ApiProperty({ type: [BulkEnquiryResponseDto] })
  items!: BulkEnquiryResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiPropertyOptional()
  page?: number;

  @ApiPropertyOptional()
  limit?: number;

  @ApiPropertyOptional()
  totalPages?: number;
}

export class BulkFormConfigDto {
  @ApiProperty()
  deliveryRequirements!: Array<{ value: string; label: string }>;

  @ApiProperty()
  preferredContacts!: Array<{ value: string; label: string }>;

  @ApiProperty()
  units!: string[];

  @ApiProperty()
  brickProductTypes!: Array<{ value: string; label: string }>;

  @ApiProperty()
  brickGrades!: Array<{ value: string; label: string }>;

  @ApiProperty()
  categories!: Array<{
    id: string;
    slug: string;
    name: string;
    imageUrl?: string | null;
  }>;
}
