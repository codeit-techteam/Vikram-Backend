import { Injectable } from '@nestjs/common';
import { LoyaltyTier } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  LoyaltyHistoryResponseDto,
  LoyaltySummaryDto,
  LoyaltyTransactionResponseDto,
} from './dto/loyalty.dto';

const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 2000,
  PLATINUM: 5000,
};

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getLoyaltySummary(customerId: string): Promise<LoyaltySummaryDto> {
    const cacheKey = CACHE_KEYS.LOYALTY(customerId);
    const cached = await this.cache.get<LoyaltySummaryDto>(cacheKey);
    if (cached) return cached;

    const account = await this.ensureAccount(customerId);
    const result = this.mapAccount(account);
    await this.cache.set(cacheKey, result, CACHE_TTL.LOYALTY);
    return result;
  }

  async getLoyaltyHistory(customerId: string): Promise<LoyaltyHistoryResponseDto> {
    const account = await this.ensureAccount(customerId);

    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      account: this.mapAccount(account),
      transactions: transactions.map((t) => this.mapTransaction(t)),
    };
  }

  async getRedeemablePoints(customerId: string): Promise<number> {
    const summary = await this.getLoyaltySummary(customerId);
    return summary.redeemablePoints;
  }

  private async ensureAccount(customerId: string) {
    return this.prisma.loyaltyAccount.upsert({
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
  }

  private resolveTier(points: number): LoyaltyTier {
    if (points >= TIER_THRESHOLDS.PLATINUM) return LoyaltyTier.PLATINUM;
    if (points >= TIER_THRESHOLDS.GOLD) return LoyaltyTier.GOLD;
    if (points >= TIER_THRESHOLDS.SILVER) return LoyaltyTier.SILVER;
    return LoyaltyTier.BRONZE;
  }

  private mapAccount(account: {
    id: string;
    customerId: string;
    currentPoints: number;
    redeemedPoints: number;
    availablePoints: number;
    tier: LoyaltyTier;
  }): LoyaltySummaryDto {
    const availablePoints = Math.max(
      0,
      account.currentPoints - account.redeemedPoints,
    );

    return {
      id: account.id,
      customerId: account.customerId,
      currentPoints: account.currentPoints,
      redeemedPoints: account.redeemedPoints,
      availablePoints,
      tier: this.resolveTier(account.currentPoints),
      redeemablePoints: availablePoints,
    };
  }

  private mapTransaction(tx: {
    id: string;
    points: number;
    type: LoyaltyTransactionResponseDto['type'];
    reason: string;
    referenceId: string | null;
    createdAt: Date;
  }): LoyaltyTransactionResponseDto {
    return {
      id: tx.id,
      points: tx.points,
      type: tx.type,
      reason: tx.reason,
      referenceId: tx.referenceId,
      createdAt: tx.createdAt.toISOString(),
    };
  }
}
