import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BulkDeliveryRequirement,
  BulkEnquiryStatus,
  BulkFollowUpStatus,
  BulkQuotationStatus,
  SupportTicketPriority,
  SupportTicketReason,
  SupportTicketStatus,
} from '../../../../generated/prisma/client';

export class CePaginationQueryDto {
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

export class CeCustomerSearchQueryDto extends CePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by mobile, name, company, or customer ID' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  executiveId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc';
}

export class CeLookupCustomerDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Invalid Indian mobile number',
  })
  phone: string;
}

export class CeSendOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Invalid Indian mobile number',
  })
  phone: string;
}

export class CeVerifyOtpDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Invalid Indian mobile number',
  })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  otp: string;
}

export class CeRegisterCustomerDto {
  @ApiProperty()
  @IsString()
  @Matches(/^(\+91|91|0)?[6-9]\d{9}$/, {
    message: 'Invalid Indian mobile number',
  })
  phone: string;

  @ApiProperty({ description: 'OTP verification session token from verify-otp' })
  @IsString()
  @MinLength(16)
  verificationToken: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Customer type / role slug' })
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstNumber?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(10)
  pincode: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;
}

export class CeUpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

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
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerType?: string;
}

export class CeUpdateCustomerNoteDto {
  @ApiProperty({ description: 'Internal note visible to customer executives' })
  @IsString()
  @MinLength(1)
  note: string;
}

export class CeOrderItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CeCreateOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Existing customer address/site ID' })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({ type: [CeOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CeOrderItemDto)
  items?: CeOrderItemDto[];

  @ApiPropertyOptional({ enum: ['CASH', 'MANUAL'] })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  loyaltyPointsToRedeem?: number;

  @ApiPropertyOptional({ description: 'Inline delivery address when addressId is absent' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryPincode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryState?: string;
}

export class CeUpdateOrderAddressDto {
  @ApiProperty()
  @IsUUID()
  addressId: string;
}

export class CeUpdateOrderPaymentDto {
  @ApiProperty({ enum: ['CASH', 'MANUAL'] })
  @IsString()
  paymentMethod: string;
}

export class CeCancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CeBulkQueryDto extends CePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class CeBulkStatusDto {
  @ApiProperty({ enum: BulkEnquiryStatus })
  @IsEnum(BulkEnquiryStatus)
  status!: BulkEnquiryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CeBulkAssignDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  executiveId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedExecutive?: string;
}

export class CeBulkFollowUpDto {
  @ApiProperty()
  @IsDateString()
  followUpAt!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class CeBulkFollowUpStatusDto {
  @ApiProperty({ enum: BulkFollowUpStatus })
  @IsEnum(BulkFollowUpStatus)
  status!: BulkFollowUpStatus;
}

export class CeBulkNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class CeBulkQuotationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  materialLabel!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  gstPercent?: number;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class CeBulkQuotationStatusDto {
  @ApiProperty({ enum: BulkQuotationStatus })
  @IsEnum(BulkQuotationStatus)
  status!: BulkQuotationStatus;
}

export class CeBulkConvertDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
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

export class CeBulkRejectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class CeEmergencyStatusDto {
  @ApiProperty()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CeSendPaymentLinkDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}

export class CePaymentReminderDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;
}

export class CeCreateTicketDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({ enum: SupportTicketReason })
  @IsEnum(SupportTicketReason)
  reason: SupportTicketReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  description: string;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;
}

export class CeUpdateTicketDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CeTicketQueryDto extends CePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;
}

export class CePaymentQueryDto extends CePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkStatus?: string;
}

export class CeTrackingSearchQueryDto {
  @ApiProperty({ description: 'Order ID, order number, customer mobile, or name' })
  @IsString()
  @MinLength(2)
  q: string;
}

export class CeRenewMembershipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class CeOrdersQueryDto extends CePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderSource?: string;
}
