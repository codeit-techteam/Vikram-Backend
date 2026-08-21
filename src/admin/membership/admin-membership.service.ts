import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  CreateMembershipPlanDto,
  UpdateMembershipPlanDto,
  MembershipQueryDto,
} from './dto/admin-membership.dto';

@Injectable()
export class AdminMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Plans ─────────────────────────────────────────────────────────────────

  async findAllPlans() {
    return this.prisma.membershipPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPlan(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Membership plan not found');
    return plan;
  }

  async createPlan(dto: CreateMembershipPlanDto) {
    return this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        price: dto.price,
        durationDays: dto.durationDays,
        description: dto.description,
        benefits: dto.benefits ?? [],
        status: 'ACTIVE',
      },
    });
  }

  async updatePlan(id: string, dto: UpdateMembershipPlanDto) {
    await this.findPlan(id);
    return this.prisma.membershipPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.durationDays !== undefined && {
          durationDays: dto.durationDays,
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.benefits !== undefined && { benefits: dto.benefits }),
        ...(dto.status !== undefined && { status: dto.status as EntityStatus }),
      },
    });
  }

  async deletePlan(id: string) {
    await this.findPlan(id);
    return this.prisma.membershipPlan.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE },
    });
  }

  // ── Customer Memberships ───────────────────────────────────────────────────

  async findAllCustomerMemberships(query: MembershipQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const where: Record<string, unknown> = {};
    if (query.status) {
      if (query.status === 'EXPIRING_SOON') {
        const soon = new Date();
        soon.setDate(soon.getDate() + 30);
        where['status'] = 'ACTIVE';
        where['expiryDate'] = { lte: soon, gte: new Date() };
      } else {
        where['status'] = query.status;
      }
    }
    if (search) {
      where['OR'] = [
        { customerId: search },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
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
        { plan: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customerMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              phone: true,
              fullName: true,
              profile: { select: { companyName: true } },
              addresses: {
                where: { isDefault: true, deletedAt: null },
                take: 1,
                select: { city: true },
              },
            },
          },
          plan: {
            select: { id: true, name: true, price: true, benefits: true },
          },
        },
      }),
      this.prisma.customerMembership.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        ...row,
        amount: Number(row.plan?.price ?? 0),
        customerCity: row.customer.addresses[0]?.city ?? null,
        customerCompany: row.customer.profile?.companyName ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findCustomerMembership(id: string) {
    const m = await this.prisma.customerMembership.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            profile: { select: { companyName: true } },
            addresses: {
              where: { isDefault: true, deletedAt: null },
              take: 1,
              select: { city: true },
            },
          },
        },
        plan: true,
      },
    });
    if (!m) throw new NotFoundException('Membership not found');

    const history = await this.prisma.customerMembership.findMany({
      where: { customerId: m.customerId },
      orderBy: { purchaseDate: 'desc' },
      include: {
        plan: { select: { id: true, name: true, price: true } },
      },
    });

    return {
      ...m,
      amount: Number(m.plan?.price ?? 0),
      customerCity: m.customer.addresses[0]?.city ?? null,
      customerCompany: m.customer.profile?.companyName ?? null,
      history: history.map((entry) => ({
        id: entry.id,
        plan: entry.plan.name,
        planId: entry.planId,
        purchaseDate: entry.purchaseDate,
        expiryDate: entry.expiryDate,
        amount: Number(entry.plan.price ?? 0),
        status: entry.status,
        paymentStatus: entry.paymentStatus,
      })),
    };
  }

  async approveMembership(id: string) {
    const membership = await this.findCustomerMembership(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerMembership.update({
        where: { id },
        data: { paymentStatus: 'PAID', status: 'ACTIVE' },
      });
      await tx.customer.update({
        where: { id: membership.customerId },
        data: { isMember: true, membershipId: id },
      });
      return updated;
    });
  }

  async cancelMembership(id: string) {
    const membership = await this.findCustomerMembership(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerMembership.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await tx.customer.update({
        where: { id: membership.customerId },
        data: { isMember: false, membershipId: null },
      });
      return updated;
    });
  }

  async renewMembership(id: string) {
    const membership = await this.findCustomerMembership(id);
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + membership.plan.durationDays);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerMembership.update({
        where: { id },
        data: {
          expiryDate: newExpiry,
          status: 'ACTIVE',
          renewalDate: new Date(),
          paymentStatus: 'PAID',
        },
      });
      await tx.customer.update({
        where: { id: membership.customerId },
        data: { isMember: true, membershipId: id },
      });
      return updated;
    });
  }

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const [totalMembers, activeMemberships, expiringThisMonth, revenueAgg] =
      await Promise.all([
        this.prisma.customer.count({
          where: { deletedAt: null, isMember: true },
        }),
        this.prisma.customerMembership.count({
          where: { status: 'ACTIVE' },
        }),
        this.prisma.customerMembership.count({
          where: {
            status: 'ACTIVE',
            expiryDate: { gte: startOfMonth, lte: endOfMonth },
          },
        }),
        this.prisma.customerMembership.findMany({
          where: {
            paymentStatus: 'PAID',
            status: { not: 'CANCELLED' },
          },
          include: { plan: { select: { price: true } } },
        }),
      ]);

    const membershipRevenue = revenueAgg.reduce(
      (sum, row) => sum + Number(row.plan.price ?? 0),
      0,
    );

    return {
      totalMembers,
      activeMemberships,
      expiringThisMonth,
      membershipRevenue,
    };
  }
}
