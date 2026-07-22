import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import {
  LoyaltyTier,
  LoyaltyTransactionType,
} from '../../../../generated/prisma/client';

export class LoyaltySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  currentPoints!: number;

  @ApiProperty()
  redeemedPoints!: number;

  @ApiProperty()
  availablePoints!: number;

  @ApiProperty({ enum: LoyaltyTier })
  tier!: LoyaltyTier;

  @ApiProperty({ description: 'Non-expired points redeemable at checkout (1 point = ₹1)' })
  redeemablePoints!: number;

  @ApiPropertyOptional({ enum: LoyaltyTier, nullable: true })
  nextTier?: LoyaltyTier | null;

  @ApiProperty({ example: 250 })
  pointsToNextTier!: number;

  @ApiProperty({ example: 65, description: 'Progress toward next tier (0-100)' })
  tierProgress!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO date when the next point lot expires',
  })
  nextExpiry?: string | null;

  @ApiProperty({ example: 500 })
  minRedeemPoints!: number;

  @ApiProperty({ example: 1 })
  pointValueInr!: number;

  @ApiProperty({ example: 30 })
  maxOrderRedeemPercent!: number;
}

export class LoyaltyTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  points!: number;

  @ApiProperty({ enum: LoyaltyTransactionType })
  type!: LoyaltyTransactionType;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional()
  referenceId?: string | null;

  @ApiPropertyOptional()
  referenceOrderId?: string | null;

  @ApiPropertyOptional()
  openingPoints?: number | null;

  @ApiPropertyOptional()
  closingPoints?: number | null;

  @ApiPropertyOptional()
  expiresAt?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class LoyaltyHistoryResponseDto {
  @ApiProperty({ type: LoyaltySummaryDto })
  account!: LoyaltySummaryDto;

  @ApiProperty({ type: [LoyaltyTransactionResponseDto] })
  transactions!: LoyaltyTransactionResponseDto[];
}

export class LoyaltyRedeemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ example: 500, minimum: 500 })
  @IsInt()
  @Min(500)
  points!: number;
}

export class LoyaltyRedeemResponseDto {
  @ApiProperty({ example: 500, description: 'Discount amount in INR' })
  discount!: number;

  @ApiProperty({ example: 500 })
  pointsRedeemed!: number;

  @ApiProperty({ example: 1200 })
  remainingBalance!: number;

  @ApiProperty()
  transactionId!: string;
}

export class LoyaltyEarnDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;
}

export class LoyaltyEarnResponseDto {
  @ApiProperty()
  earned!: boolean;

  @ApiProperty()
  points!: number;

  @ApiPropertyOptional()
  transactionId?: string;

  @ApiProperty()
  message!: string;
}
