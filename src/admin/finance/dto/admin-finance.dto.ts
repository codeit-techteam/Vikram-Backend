import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SettlementStatus,
  RefundStatus,
} from '../../../../generated/prisma/client';

export class FinancePaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class FinanceDateRangeDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class RefundLedgerQueryDto extends FinancePaginationDto {
  @ApiPropertyOptional({ enum: RefundStatus, example: RefundStatus.PENDING })
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class CreateRefundDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 'Order cancellation refund for BJW-2026-000042' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class RejectRefundDto {
  @ApiProperty({ example: 'Refund not eligible — order already delivered' })
  @IsString()
  reason!: string;
}

export class HubSettlementQueryDto extends FinancePaginationDto {
  @ApiPropertyOptional({
    enum: SettlementStatus,
    example: SettlementStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class GenerateHubSettlementDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
  hubId!: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-07-21' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Platform commission percentage',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  @ApiPropertyOptional({ example: 'Weekly hub settlement — Mumbai Central' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VendorSettlementQueryDto extends FinancePaginationDto {
  @ApiPropertyOptional({
    enum: SettlementStatus,
    example: SettlementStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @ApiPropertyOptional({ example: 'UltraTech' })
  @IsOptional()
  @IsString()
  vendorKey?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-21' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class GenerateVendorSettlementDto {
  @ApiProperty({
    example: 'UltraTech',
    description: 'Product brand used as vendor identifier',
  })
  @IsString()
  vendorKey!: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-07-21' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Marketplace commission percentage',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  @ApiPropertyOptional({ example: 'Monthly vendor payout — cement brands' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectSettlementDto {
  @ApiProperty({
    example: 'Discrepancy in order totals — recalculate required',
  })
  @IsString()
  reason!: string;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 45 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}

export class FinanceDashboardCardsDto {
  @ApiProperty({ example: 125000.5 })
  todaysCollection!: number;

  @ApiProperty({ example: 458900.0 })
  membershipRevenue!: number;

  @ApiProperty({ example: 8500.0 })
  refundPending!: number;

  @ApiProperty({ example: 32000.0 })
  vendorPending!: number;

  @ApiProperty({ example: 67500.0 })
  hubPending!: number;
}

export class DailyClosingResponseDto {
  @ApiProperty({ example: '2026-07-21' })
  date!: string;

  @ApiProperty({
    example: {
      total: 125000.5,
      cash: 98000.0,
      manual: 27000.5,
      orderCount: 18,
    },
  })
  revenue!: Record<string, number>;

  @ApiProperty({
    example: {
      approved: 3500.0,
      pending: 8500.0,
      count: 4,
    },
  })
  refunds!: Record<string, number>;

  @ApiProperty({
    example: {
      placed: 22,
      delivered: 18,
      cancelled: 2,
      pending: 2,
    },
  })
  orders!: Record<string, number>;

  @ApiProperty({
    example: {
      hubPendingAmount: 67500.0,
      hubPendingCount: 3,
      vendorPendingAmount: 32000.0,
      vendorPendingCount: 2,
    },
  })
  pendingSettlement!: Record<string, number>;
}
