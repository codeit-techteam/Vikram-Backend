import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  LoyaltyTier,
  LoyaltyTransactionType,
} from '../../../../generated/prisma/client';

export class LoyaltySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty({ description: 'Lifetime earned points' })
  currentPoints!: number;

  @ApiProperty({ description: 'Alias of currentPoints (lifetime earned)' })
  lifetimeEarned!: number;

  @ApiProperty()
  redeemedPoints!: number;

  @ApiProperty({ description: 'Alias of redeemedPoints' })
  lifetimeRedeemed!: number;

  @ApiProperty()
  availablePoints!: number;

  @ApiProperty({ example: 22.57, description: 'availablePoints × pointValueInr' })
  availableValue!: number;

  @ApiProperty({ enum: LoyaltyTier })
  tier!: LoyaltyTier;

  @ApiProperty({ description: 'Non-expired points redeemable at checkout' })
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

  @ApiProperty({
    example: 500,
    description: 'Minimum order value (INR) required to redeem',
  })
  minRedeemPoints!: number;

  @ApiProperty({ example: 500 })
  minRedeemOrderValue!: number;

  @ApiProperty({ example: 0.01, description: 'INR value of 1 loyalty point' })
  pointValueInr!: number;

  @ApiProperty({ example: 30 })
  maxOrderRedeemPercent!: number;

  @ApiProperty({ example: 50 })
  welcomeBonus!: number;

  @ApiProperty({ example: 50 })
  firstOrderBonus!: number;

  @ApiProperty({ example: 1 })
  earnPointsPer100Inr!: number;

  @ApiProperty({ example: 3, description: 'Total free bike deliveries allowed' })
  freeBikeDeliveriesAllowed!: number;

  @ApiProperty({ example: 1, description: 'Free bike deliveries already used' })
  freeBikeDeliveriesUsed!: number;

  @ApiProperty({ example: 2, description: 'Free bike deliveries remaining' })
  freeBikeDeliveriesRemaining!: number;
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

export class LoyaltyHistoryMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class LoyaltyHistoryResponseDto {
  @ApiProperty({ type: LoyaltySummaryDto })
  account!: LoyaltySummaryDto;

  @ApiProperty({ type: [LoyaltyTransactionResponseDto] })
  transactions!: LoyaltyTransactionResponseDto[];

  @ApiPropertyOptional({ type: LoyaltyHistoryMetaDto })
  meta?: LoyaltyHistoryMetaDto;
}

export class LoyaltyHistoryQueryDto {
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
  @Max(50)
  limit?: number = 20;
}

export class LoyaltyRedeemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ example: 100, minimum: 1 })
  @IsInt()
  @Min(1)
  points!: number;
}

export class LoyaltyRedeemResponseDto {
  @ApiProperty({ example: 1, description: 'Discount amount in INR' })
  discount!: number;

  @ApiProperty({ example: 100 })
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
  orderEarnedPoints?: number;

  @ApiPropertyOptional()
  firstOrderBonusPoints?: number;

  @ApiPropertyOptional()
  transactionId?: string;

  @ApiProperty()
  message!: string;
}
