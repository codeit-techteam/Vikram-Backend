import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from '../../../../generated/prisma/client';

export class WalletSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerId!: string;

  @ApiProperty({ example: 1500 })
  balance!: number;

  @ApiProperty()
  updatedAt!: string;
}

export class WalletTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: WalletTransactionType })
  type!: WalletTransactionType;

  @ApiProperty()
  credit!: number;

  @ApiProperty()
  debit!: number;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional()
  referenceId?: string | null;

  @ApiPropertyOptional()
  referenceType?: string | null;

  @ApiProperty({ enum: WalletTransactionStatus })
  status!: WalletTransactionStatus;

  @ApiProperty()
  createdAt!: string;
}

export class WalletHistoryResponseDto {
  @ApiProperty({ type: WalletSummaryDto })
  wallet!: WalletSummaryDto;

  @ApiProperty({ type: [WalletTransactionResponseDto] })
  transactions!: WalletTransactionResponseDto[];
}
