import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LoyaltyTransactionType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { LoyaltyAdjustDto, LoyaltyRewardDto, LoyaltyRedeemDto, LoyaltyQueryDto } from './dto/admin-loyalty.dto';

@Injectable()
export class AdminLoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: LoyaltyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.loyaltyAccount.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { customer: { select: { id: true, phone: true, fullName: true } } },
      }),
      this.prisma.loyaltyAccount.count(),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByCustomer(customerId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: {
        customer: { select: { id: true, phone: true, fullName: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!account) throw new NotFoundException('Loyalty account not found');
    return account;
  }

  async adjustPoints(customerId: string, dto: LoyaltyAdjustDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
    if (!account) throw new NotFoundException('Loyalty account not found');

    const newAvailable = account.availablePoints + dto.points;
    if (newAvailable < 0) throw new BadRequestException('Insufficient loyalty points');

    return this.prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          availablePoints: { increment: dto.points },
          currentPoints: { increment: dto.points },
        },
      });
      return tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          points: dto.points,
          type: LoyaltyTransactionType.ADMIN,
          reason: dto.reason,
        },
      });
    });
  }

  async rewardPoints(customerId: string, dto: LoyaltyRewardDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
    if (!account) throw new NotFoundException('Loyalty account not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          availablePoints: { increment: dto.points },
          currentPoints: { increment: dto.points },
        },
      });
      return tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          points: dto.points,
          type: LoyaltyTransactionType.EARN,
          reason: dto.reason,
          referenceId: dto.referenceId,
        },
      });
    });
  }

  async redeemPoints(customerId: string, dto: LoyaltyRedeemDto) {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
    if (!account) throw new NotFoundException('Loyalty account not found');
    if (account.availablePoints < dto.points) throw new BadRequestException('Insufficient points');

    return this.prisma.$transaction(async (tx) => {
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          availablePoints: { decrement: dto.points },
          redeemedPoints: { increment: dto.points },
        },
      });
      return tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          points: dto.points,
          type: LoyaltyTransactionType.REDEEM,
          reason: dto.reason,
        },
      });
    });
  }
}
