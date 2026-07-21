import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
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
}

export class CeUpdateCustomerNoteDto {
  @ApiProperty({ description: 'Internal note visible to customer executives' })
  @IsString()
  @MinLength(1)
  note: string;
}

export class CeCreateOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsUUID()
  addressId: string;

  @ApiPropertyOptional({ enum: ['CASH', 'MANUAL', 'UPI', 'CARD'] })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CeUpdateOrderAddressDto {
  @ApiProperty()
  @IsUUID()
  addressId: string;
}

export class CeUpdateOrderPaymentDto {
  @ApiProperty({ enum: ['CASH', 'MANUAL', 'UPI', 'CARD'] })
  @IsString()
  paymentMethod: string;
}

export class CeCancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CeBulkStatusDto {
  @ApiProperty()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
}

export class CeUpdateTicketDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;
}

export class CeRenewMembershipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;
}
