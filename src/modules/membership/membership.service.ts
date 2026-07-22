import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntityStatus,
  MembershipStatus,
  PaymentStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  CustomerMembershipResponseDto,
  MembershipPlanResponseDto,
  MembershipSummaryDto,
} from './dto/membership.dto';

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getCurrentMembership(
    customerId: string,
  ): Promise<MembershipSummaryDto> {
    const cacheKey = CACHE_KEYS.MEMBERSHIP(customerId);
    const cached = await this.cache.get<MembershipSummaryDto>(cacheKey);
    if (cached) return cached;

    await this.expireStaleMemberships(customerId);

    const [current, historyCount] = await Promise.all([
      this.prisma.customerMembership.findFirst({
        where: {
          customerId,
          status: MembershipStatus.ACTIVE,
          expiryDate: { gt: new Date() },
        },
        include: { plan: true },
        orderBy: { expiryDate: 'desc' },
      }),
      this.prisma.customerMembership.count({ where: { customerId } }),
    ]);

    const result: MembershipSummaryDto = {
      current: current ? this.mapMembership(current) : null,
      hasMembershipHistory: historyCount > 0,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.MEMBERSHIP);
    return result;
  }

  async listPlans(): Promise<MembershipPlanResponseDto[]> {
    const cached = await this.cache.get<MembershipPlanResponseDto[]>(
      CACHE_KEYS.MEMBERSHIP_PLANS,
    );
    if (cached) return cached;

    const plans = await this.prisma.membershipPlan.findMany({
      where: { status: EntityStatus.ACTIVE },
      orderBy: [{ price: 'asc' }],
    });

    const result = plans.map((p) => this.mapPlan(p));
    await this.cache.set(CACHE_KEYS.MEMBERSHIP_PLANS, result, CACHE_TTL.MEMBERSHIP);
    return result;
  }

  async purchasePlan(
    customerId: string,
    planId: string,
  ): Promise<CustomerMembershipResponseDto> {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, status: EntityStatus.ACTIVE },
    });

    if (!plan) {
      throw new NotFoundException('Membership plan not found');
    }

    const existingActive = await this.prisma.customerMembership.findFirst({
      where: {
        customerId,
        status: MembershipStatus.ACTIVE,
        expiryDate: { gt: new Date() },
      },
    });

    if (existingActive) {
      throw new BadRequestException(
        'You already have an active membership. Use renew to extend.',
      );
    }

    const purchaseDate = new Date();
    const expiryDate = new Date(purchaseDate);
    expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

    const membership = await this.prisma.customerMembership.create({
      data: {
        customerId,
        planId: plan.id,
        purchaseDate,
        expiryDate,
        status: MembershipStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
      },
      include: { plan: true },
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        isMember: true,
        membershipId: membership.id,
      },
    });

    await this.cache.del(CACHE_KEYS.MEMBERSHIP(customerId));
    return this.mapMembership(membership);
  }

  async renewMembership(
    customerId: string,
    planId?: string,
  ): Promise<CustomerMembershipResponseDto> {
    await this.expireStaleMemberships(customerId);

    const current = await this.prisma.customerMembership.findFirst({
      where: { customerId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const targetPlanId = planId ?? current?.planId;
    if (!targetPlanId) {
      throw new BadRequestException(
        'No existing membership found. Purchase a plan first.',
      );
    }

    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: targetPlanId, status: EntityStatus.ACTIVE },
    });

    if (!plan) {
      throw new NotFoundException('Membership plan not found');
    }

    const baseDate =
      current?.status === MembershipStatus.ACTIVE &&
      current.expiryDate > new Date()
        ? current.expiryDate
        : new Date();

    const expiryDate = new Date(baseDate);
    expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

    if (current?.status === MembershipStatus.ACTIVE) {
      await this.prisma.customerMembership.update({
        where: { id: current.id },
        data: {
          status: MembershipStatus.EXPIRED,
          renewalDate: new Date(),
        },
      });
    }

    const membership = await this.prisma.customerMembership.create({
      data: {
        customerId,
        planId: plan.id,
        purchaseDate: new Date(),
        expiryDate,
        status: MembershipStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
        renewalDate: new Date(),
      },
      include: { plan: true },
    });

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        isMember: true,
        membershipId: membership.id,
      },
    });

    await this.cache.del(CACHE_KEYS.MEMBERSHIP(customerId));
    return this.mapMembership(membership);
  }

  async getActiveMembershipDiscountPercent(
    customerId: string,
  ): Promise<number> {
    const summary = await this.getCurrentMembership(customerId);
    if (!summary.current?.isActive) return 0;
    return 5;
  }

  private async expireStaleMemberships(customerId: string): Promise<void> {
    const stale = await this.prisma.customerMembership.findMany({
      where: {
        customerId,
        status: MembershipStatus.ACTIVE,
        expiryDate: { lte: new Date() },
      },
      select: { id: true },
    });

    if (stale.length === 0) return;

    await this.prisma.$transaction([
      this.prisma.customerMembership.updateMany({
        where: { id: { in: stale.map((m) => m.id) } },
        data: { status: MembershipStatus.EXPIRED },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { isMember: false, membershipId: null },
      }),
    ]);
  }

  private mapPlan(plan: {
    id: string;
    name: string;
    price: unknown;
    durationDays: number;
    description: string | null;
    benefits: unknown;
    status: EntityStatus;
  }): MembershipPlanResponseDto {
    return {
      id: plan.id,
      name: plan.name,
      price: Number(plan.price),
      durationDays: plan.durationDays,
      description: plan.description,
      benefits: Array.isArray(plan.benefits)
        ? (plan.benefits as string[])
        : [],
      status: plan.status,
    };
  }

  private mapMembership(membership: {
    id: string;
    customerId: string;
    purchaseDate: Date;
    expiryDate: Date;
    status: MembershipStatus;
    paymentStatus: PaymentStatus;
    renewalDate: Date | null;
    plan: {
      id: string;
      name: string;
      price: unknown;
      durationDays: number;
      description: string | null;
      benefits: unknown;
      status: EntityStatus;
    };
  }): CustomerMembershipResponseDto {
    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (membership.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    return {
      id: membership.id,
      customerId: membership.customerId,
      plan: this.mapPlan(membership.plan),
      purchaseDate: membership.purchaseDate.toISOString(),
      expiryDate: membership.expiryDate.toISOString(),
      status: membership.status,
      paymentStatus: membership.paymentStatus,
      renewalDate: membership.renewalDate?.toISOString() ?? null,
      daysRemaining,
      isActive:
        membership.status === MembershipStatus.ACTIVE &&
        membership.expiryDate > now,
    };
  }
}
