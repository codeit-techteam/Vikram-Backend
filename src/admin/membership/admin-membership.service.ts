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
    return this.prisma.membershipPlan.findMany({ orderBy: { createdAt: 'desc' } });
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
        ...(dto.durationDays !== undefined && { durationDays: dto.durationDays }),
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
    const where: Record<string, unknown> = {};
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.customerMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          plan: { select: { id: true, name: true, price: true } },
        },
      }),
      this.prisma.customerMembership.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findCustomerMembership(id: string) {
    const m = await this.prisma.customerMembership.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
      },
    });
    if (!m) throw new NotFoundException('Membership not found');
    return m;
  }

  async approveMembership(id: string) {
    await this.findCustomerMembership(id);
    return this.prisma.customerMembership.update({
      where: { id },
      data: { paymentStatus: 'PAID' },
    });
  }

  async cancelMembership(id: string) {
    await this.findCustomerMembership(id);
    return this.prisma.customerMembership.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async renewMembership(id: string) {
    const membership = await this.findCustomerMembership(id);
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + membership.plan.durationDays);

    return this.prisma.customerMembership.update({
      where: { id },
      data: {
        expiryDate: newExpiry,
        status: 'ACTIVE',
        renewalDate: new Date(),
        paymentStatus: 'PAID',
      },
    });
  }
}
