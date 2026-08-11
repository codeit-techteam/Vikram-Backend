import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  LoyaltyTier,
  LoyaltyTransactionType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { LoyaltyTransactionService } from '../../modules/loyalty/loyalty-transaction.service';
import {
  addMonths,
  availableValueInr,
  getNextTierInfo,
  LOYALTY_POINT_VALUE_INR,
  LOYALTY_POINTS_EXPIRY_MONTHS,
  LOYALTY_REF,
  FREE_BIKE_DELIVERIES_ALLOWED,
  resolveTierFromPoints,
} from '../../modules/loyalty/loyalty.constants';
import { DeliveryBenefitService } from '../../modules/delivery/delivery-benefit.service';
import type {
  LoyaltyAdjustDto,
  LoyaltyRewardDto,
  LoyaltyRedeemDto,
  LoyaltyQueryDto,
} from './dto/admin-loyalty.dto';

const customerLoyaltySelect = {
  id: true,
  phone: true,
  fullName: true,
  profile: { select: { companyName: true } },
  addresses: {
    where: { isDefault: true, deletedAt: null },
    take: 1,
    select: { city: true },
  },
} satisfies Prisma.CustomerSelect;

@Injectable()
export class AdminLoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly deliveryBenefitService: DeliveryBenefitService,
  ) {}

  async findAll(query: LoyaltyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.LoyaltyAccountWhereInput = {};

    if (query.tier) {
      where.tier = query.tier as LoyaltyTier;
    }

    if (search) {
      where.OR = [
        { customerId: search },
        {
          customer: {
            fullName: { contains: search, mode: 'insensitive' },
          },
        },
        {
          customer: {
            phone: { contains: search, mode: 'insensitive' },
          },
        },
        {
          customer: {
            profile: {
              companyName: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          customer: {
            addresses: {
              some: {
                deletedAt: null,
                city: { contains: search, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.loyaltyAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { availablePoints: 'desc' },
        include: {
          customer: { select: customerLoyaltySelect },
        },
      }),
      this.prisma.loyaltyAccount.count({ where }),
    ]);

    return {
      data: data.map((account) => {
        const tier = resolveTierFromPoints(account.currentPoints);
        const tierInfo = getNextTierInfo(account.currentPoints);
        return {
          ...account,
          tier,
          lifetimeEarned: account.currentPoints,
          lifetimeRedeemed: account.redeemedPoints,
          nextTier: tierInfo.nextTier,
          pointsToNextTier: tierInfo.pointsToNextTier,
          tierProgress: tierInfo.tierProgress,
          customerCity: account.customer.addresses[0]?.city ?? null,
          customerCompany: account.customer.profile?.companyName ?? null,
        };
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findByCustomer(customerId: string) {
    let account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: {
        customer: { select: customerLoyaltySelect },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });

    if (!account) {
      await this.loyaltyTransactionService.ensureAccount(
        this.prisma,
        customerId,
      );
      account = await this.prisma.loyaltyAccount.findUnique({
        where: { customerId },
        include: {
          customer: { select: customerLoyaltySelect },
          transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      });
    }

    if (!account) throw new NotFoundException('Loyalty account not found');

    const [redeemablePoints, deliveryBenefit, firstOrderBonus] =
      await Promise.all([
        this.loyaltyTransactionService.getNonExpiredBalance(account.id),
        this.deliveryBenefitService.getSummary(customerId),
        this.prisma.loyaltyTransaction.findFirst({
          where: {
            accountId: account.id,
            referenceId: LOYALTY_REF.FIRST_ORDER_BONUS,
          },
          select: { id: true },
        }),
      ]);

    const tier = resolveTierFromPoints(account.currentPoints);
    const tierInfo = getNextTierInfo(account.currentPoints);

    return {
      ...account,
      tier,
      redeemablePoints,
      availablePoints: redeemablePoints,
      availableValue: availableValueInr(redeemablePoints),
      lifetimeEarned: account.currentPoints,
      lifetimeRedeemed: account.redeemedPoints,
      pointValueInr: LOYALTY_POINT_VALUE_INR,
      nextTier: tierInfo.nextTier,
      pointsToNextTier: tierInfo.pointsToNextTier,
      tierProgress: tierInfo.tierProgress,
      customerCity: account.customer.addresses[0]?.city ?? null,
      customerCompany: account.customer.profile?.companyName ?? null,
      firstOrderBonusClaimed: !!firstOrderBonus,
      freeBikeDeliveriesAllowed:
        deliveryBenefit.totalAllowed || FREE_BIKE_DELIVERIES_ALLOWED,
      freeBikeDeliveriesUsed: deliveryBenefit.usedCount,
      freeBikeDeliveriesRemaining: deliveryBenefit.remainingCount,
    };
  }

  async getStats() {
    const issuedWhere: Prisma.LoyaltyTransactionWhereInput = {
      OR: [
        { type: LoyaltyTransactionType.EARN },
        { type: LoyaltyTransactionType.ADMIN },
        {
          type: LoyaltyTransactionType.ADJUSTMENT,
          remainingPoints: { not: null },
        },
      ],
    };

    const [
      totalPointsIssued,
      redeemedPoints,
      activeAccounts,
      topCustomersCount,
      tierDistribution,
    ] = await Promise.all([
      this.prisma.loyaltyTransaction.aggregate({
        where: issuedWhere,
        _sum: { points: true },
      }),
      this.prisma.loyaltyTransaction.aggregate({
        where: { type: LoyaltyTransactionType.REDEEM },
        _sum: { points: true },
      }),
      this.prisma.loyaltyAccount.count(),
      this.prisma.loyaltyAccount.count({
        where: { tier: { in: [LoyaltyTier.GOLD, LoyaltyTier.PLATINUM] } },
      }),
      this.prisma.loyaltyAccount.groupBy({
        by: ['tier'],
        _count: { tier: true },
      }),
    ]);

    return {
      totalPointsIssued: totalPointsIssued._sum.points ?? 0,
      redeemedPoints: redeemedPoints._sum.points ?? 0,
      /** No loyalty reservation/hold model — pending is always 0 */
      pendingRedemptions: 0,
      pending: 0,
      activeAccounts,
      topCustomersCount,
      topCustomers: topCustomersCount,
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
      tier: resolveTierFromPoints(account.currentPoints),
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
