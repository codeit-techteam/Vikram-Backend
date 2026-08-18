import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { DeliveryBenefitService } from '../delivery/delivery-benefit.service';
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
    private readonly deliveryBenefitService: DeliveryBenefitService,
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
      },
      update: {},
    });

    const [redeemablePoints, nextExpiry, deliveryBenefit] = await Promise.all([
      this.loyaltyTransactionService.getNonExpiredBalance(account.id),
      this.loyaltyTransactionService.getNextExpiry(account.id),
      this.deliveryBenefitService.getSummary(customerId),
    ]);

    const result = {
      ...this.loyaltyTransactionService.buildSummary(
        account,
        redeemablePoints,
        nextExpiry,
      ),
      freeBikeDeliveriesAllowed: deliveryBenefit.totalAllowed,
      freeBikeDeliveriesUsed: deliveryBenefit.usedCount,
      freeBikeDeliveriesRemaining: deliveryBenefit.remainingCount,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.LOYALTY);
    return result;
  }

  async getLoyaltyHistory(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<LoyaltyHistoryResponseDto> {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account) {
      const summary = await this.getLoyaltySummary(customerId);
      return {
        account: summary,
        transactions: [],
        meta: { page: 1, limit: take, total: 0, totalPages: 0 },
      };
    }

    const [redeemablePoints, nextExpiry, total, transactions, deliveryBenefit] =
      await Promise.all([
        this.loyaltyTransactionService.getNonExpiredBalance(account.id),
        this.loyaltyTransactionService.getNextExpiry(account.id),
        this.prisma.loyaltyTransaction.count({ where: { accountId: account.id } }),
        this.prisma.loyaltyTransaction.findMany({
          where: { accountId: account.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.deliveryBenefitService.getSummary(customerId),
      ]);

    return {
      account: {
        ...this.loyaltyTransactionService.buildSummary(
          account,
          redeemablePoints,
          nextExpiry,
        ),
        freeBikeDeliveriesAllowed: deliveryBenefit.totalAllowed,
        freeBikeDeliveriesUsed: deliveryBenefit.usedCount,
        freeBikeDeliveriesRemaining: deliveryBenefit.remainingCount,
      },
      transactions: transactions.map((t) => this.mapTransaction(t)),
      meta: {
        page: Math.max(page, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take) || 0,
      },
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

    const points =
      (result.orderEarned?.points ?? 0) + (result.firstOrderBonus?.points ?? 0);

    if (points <= 0) {
      return {
        earned: false,
        points: 0,
        message: 'No points earned (order not delivered or already processed)',
      };
    }

    return {
      earned: true,
      points,
      orderEarnedPoints: result.orderEarned?.points ?? 0,
      firstOrderBonusPoints: result.firstOrderBonus?.points ?? 0,
      transactionId: result.orderEarned?.id ?? result.firstOrderBonus?.id,
      message: `${points} points credited`,
    };
  }

  async creditWelcomeBonus(customerId: string) {
    return this.loyaltyTransactionService.creditWelcomeBonus(customerId);
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
