import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  LoyaltyTier,
  LoyaltyTransactionType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { LoyaltyTransactionService } from '../../modules/loyalty/loyalty-transaction.service';
import {
  addMonths,
  LOYALTY_POINTS_EXPIRY_MONTHS,
} from '../../modules/loyalty/loyalty.constants';
import type {
  LoyaltyAdjustDto,
  LoyaltyRewardDto,
  LoyaltyRedeemDto,
  LoyaltyQueryDto,
} from './dto/admin-loyalty.dto';

@Injectable()
export class AdminLoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
  ) {}

  async findAll(query: LoyaltyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.tier ? { tier: query.tier as LoyaltyTier } : {};

    const [data, total] = await Promise.all([
      this.prisma.loyaltyAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { availablePoints: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              phone: true,
              fullName: true,
              addresses: {
                where: { isDefault: true, deletedAt: null },
                take: 1,
                select: { city: true },
              },
            },
          },
        },
      }),
      this.prisma.loyaltyAccount.count({ where }),
    ]);

    return {
      data: data.map((account) => ({
        ...account,
        customerCity: account.customer.addresses[0]?.city ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByCustomer(customerId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: {
        customer: {
          select: {
            id: true,
            phone: true,
            fullName: true,
            addresses: {
              where: { isDefault: true, deletedAt: null },
              take: 1,
              select: { city: true },
            },
          },
        },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!account) throw new NotFoundException('Loyalty account not found');

    const redeemablePoints =
      await this.loyaltyTransactionService.getNonExpiredBalance(account.id);

    return {
      ...account,
      redeemablePoints,
      customerCity: account.customer.addresses[0]?.city ?? null,
    };
  }

  async getStats() {
    const [
      totalPointsIssued,
      redeemedPoints,
      activeAccounts,
      tierDistribution,
    ] = await Promise.all([
      this.prisma.loyaltyTransaction.aggregate({
        where: { type: LoyaltyTransactionType.EARN },
        _sum: { points: true },
      }),
      this.prisma.loyaltyTransaction.aggregate({
        where: { type: LoyaltyTransactionType.REDEEM },
        _sum: { points: true },
      }),
      this.prisma.loyaltyAccount.count(),
      this.prisma.loyaltyAccount.groupBy({
        by: ['tier'],
        _count: { tier: true },
      }),
    ]);

    return {
      totalPointsIssued: totalPointsIssued._sum.points ?? 0,
      redeemedPoints: redeemedPoints._sum.points ?? 0,
      pendingRedemptions: 0,
      activeAccounts,
      tierDistribution: tierDistribution.map((row) => ({
        tier: row.tier,
        count: row._count.tier,
      })),
    };
  }

  async getLeaderboard(limit = 10) {
    const accounts = await this.prisma.loyaltyAccount.findMany({
      orderBy: { currentPoints: 'desc' },
      take: limit,
      include: {
        customer: {
          select: { id: true, fullName: true, phone: true },
        },
      },
    });

    return accounts.map((account, index) => ({
      rank: index + 1,
      customerId: account.customerId,
      customerName: account.customer.fullName,
      customerPhone: account.customer.phone,
      tier: account.tier,
      currentPoints: account.currentPoints,
      availablePoints: account.availablePoints,
    }));
  }

  async adjustPoints(customerId: string, dto: LoyaltyAdjustDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });
    if (!account) throw new NotFoundException('Loyalty account not found');

    if (dto.points === 0) {
      throw new BadRequestException('Points adjustment cannot be zero');
    }

    if (dto.points > 0) {
      return this.loyaltyTransactionService.recordEntry({
        customerId,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: dto.points,
        reason: dto.reason,
        expiresAt: addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS),
        trackLot: true,
      });
    }

    return this.loyaltyTransactionService.recordEntry({
      customerId,
      type: LoyaltyTransactionType.ADJUSTMENT,
      points: Math.abs(dto.points),
      reason: dto.reason,
      direction: 'DEBIT',
    });
  }

  async rewardPoints(customerId: string, dto: LoyaltyRewardDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });
    if (!account) throw new NotFoundException('Loyalty account not found');

    return this.loyaltyTransactionService.recordEntry({
      customerId,
      type: LoyaltyTransactionType.EARN,
      points: dto.points,
      reason: dto.reason,
      referenceId: dto.referenceId,
      expiresAt: addMonths(new Date(), LOYALTY_POINTS_EXPIRY_MONTHS),
      trackLot: true,
    });
  }

  async redeemPoints(customerId: string, dto: LoyaltyRedeemDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });
    if (!account) throw new NotFoundException('Loyalty account not found');

    const redeemable =
      await this.loyaltyTransactionService.getNonExpiredBalance(account.id);
    if (redeemable < dto.points) {
      throw new BadRequestException('Insufficient non-expired points');
    }

    return this.loyaltyTransactionService.recordEntry({
      customerId,
      type: LoyaltyTransactionType.REDEEM,
      points: dto.points,
      reason: dto.reason,
    });
  }
}
