import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiProperty({ description: 'Points redeemable at checkout (1 point = ₹1)' })
  redeemablePoints!: number;
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

  @ApiProperty()
  createdAt!: string;
}

export class LoyaltyHistoryResponseDto {
  @ApiProperty({ type: LoyaltySummaryDto })
  account!: LoyaltySummaryDto;

  @ApiProperty({ type: [LoyaltyTransactionResponseDto] })
  transactions!: LoyaltyTransactionResponseDto[];
}
