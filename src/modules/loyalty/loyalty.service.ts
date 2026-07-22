import { Injectable } from '@nestjs/common';
import { LoyaltyTier } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { LoyaltyTransactionService } from './loyalty-transaction.service';
import {
  LoyaltyEarnDto,
  LoyaltyHistoryResponseDto,
  LoyaltyRedeemDto,
  LoyaltyRedeemResponseDto,
  LoyaltySummaryDto,
  LoyaltyTransactionResponseDto,
} from './dto/loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
  ) {}

  async getLoyaltySummary(customerId: string): Promise<LoyaltySummaryDto> {
    const cacheKey = CACHE_KEYS.LOYALTY(customerId);
    const cached = await this.cache.get<LoyaltySummaryDto>(cacheKey);
    if (cached) return cached;

    const account = await this.prisma.loyaltyAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        currentPoints: 0,
        redeemedPoints: 0,
        availablePoints: 0,
        tier: LoyaltyTier.BRONZE,
      },
      update: {},
    });

    const [redeemablePoints, nextExpiry] = await Promise.all([
      this.loyaltyTransactionService.getNonExpiredBalance(account.id),
      this.loyaltyTransactionService.getNextExpiry(account.id),
    ]);

    const result = this.loyaltyTransactionService.buildSummary(
      account,
      redeemablePoints,
      nextExpiry,
    );

    await this.cache.set(cacheKey, result, CACHE_TTL.LOYALTY);
    return result;
  }

  async getLoyaltyHistory(customerId: string): Promise<LoyaltyHistoryResponseDto> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account) {
      const summary = await this.getLoyaltySummary(customerId);
      return { account: summary, transactions: [] };
    }

    const [redeemablePoints, nextExpiry, transactions] = await Promise.all([
      this.loyaltyTransactionService.getNonExpiredBalance(account.id),
      this.loyaltyTransactionService.getNextExpiry(account.id),
      this.prisma.loyaltyTransaction.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      account: this.loyaltyTransactionService.buildSummary(
        account,
        redeemablePoints,
        nextExpiry,
      ),
      transactions: transactions.map((t) => this.mapTransaction(t)),
    };
  }

  async getRedeemablePoints(customerId: string): Promise<number> {
    return this.loyaltyTransactionService.getNonExpiredBalanceForCustomer(
      customerId,
    );
  }

  async redeemPoints(
    customerId: string,
    dto: LoyaltyRedeemDto,
  ): Promise<LoyaltyRedeemResponseDto> {
    const result = await this.loyaltyTransactionService.redeemForOrder({
      customerId,
      orderId: dto.orderId,
      points: dto.points,
    });

    return {
      discount: result.discountAmount,
      pointsRedeemed: result.points,
      remainingBalance: result.closingPoints,
      transactionId: result.id,
    };
  }

  async earnForOrder(dto: LoyaltyEarnDto) {
    const result = await this.loyaltyTransactionService.earnForDeliveredOrder(
      dto.orderId,
    );

    if (!result) {
      return {
        earned: false,
        points: 0,
        message: 'No points earned (order not delivered or already processed)',
      };
    }

    return {
      earned: true,
      points: result.points,
      transactionId: result.id,
      message: `${result.points} points credited`,
    };
  }

  private mapTransaction(tx: {
    id: string;
    points: number;
    type: LoyaltyTransactionResponseDto['type'];
    reason: string;
    referenceId: string | null;
    referenceOrderId: string | null;
    openingPoints: number | null;
    closingPoints: number | null;
    expiresAt: Date | null;
    createdAt: Date;
  }): LoyaltyTransactionResponseDto {
    return {
      id: tx.id,
      points: tx.points,
      type: tx.type,
      reason: tx.reason,
      referenceId: tx.referenceId,
      referenceOrderId: tx.referenceOrderId,
      openingPoints: tx.openingPoints,
      closingPoints: tx.closingPoints,
      expiresAt: tx.expiresAt?.toISOString() ?? null,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}
