import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerStatus, MembershipStatus, PaymentStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  AdminCustomerQueryDto,
  AdminUpdateCustomerDto,
  AdminUpgradeMembershipDto,
} from './dto/admin-customers.dto';

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminCustomerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (query.search) {
      where['OR'] = [
        { phone: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        {
          profile: {
            companyName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }

    if (query.status) {
      where['status'] = query.status;
    }

    if (query.membership) {
      where['memberships'] = {
        some: { status: query.membership },
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          loyaltyAccount: {
            select: { availablePoints: true, tier: true, currentPoints: true },
          },
          memberships: {
            where: { status: 'ACTIVE' },
            include: { plan: { select: { id: true, name: true } } },
            take: 1,
          },
          addresses: {
            where: { deletedAt: null },
            select: { id: true },
          },
          orders: { select: { id: true } },
          deviceSessions: {
            orderBy: { lastLogin: 'desc' },
            take: 1,
            select: { lastLogin: true },
          },
          _count: { select: { orders: true, addresses: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const data = rows.map((c) => this.mapListItem(c));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        profile: true,
        addresses: { where: { deletedAt: null } },
        loyaltyAccount: {
          include: {
            transactions: { take: 20, orderBy: { createdAt: 'desc' } },
          },
        },
        memberships: {
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        },
        orders: { take: 20, orderBy: { createdAt: 'desc' } },
        deviceSessions: {
          orderBy: { lastLogin: 'desc' },
          take: 5,
          select: { lastLogin: true, deviceId: true, platform: true },
        },
        role: true,
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    return this.mapDetail(customer);
  }

  async update(id: string, dto: AdminUpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.status !== undefined && {
          status: dto.status as CustomerStatus,
        }),
        ...(dto.companyName !== undefined ||
        dto.gstNumber !== undefined ||
        dto.businessType !== undefined
          ? {
              profile: {
                upsert: {
                  create: {
                    companyName: dto.companyName,
                    gstNumber: dto.gstNumber,
                    businessType: dto.businessType,
                  },
                  update: {
                    ...(dto.companyName !== undefined && {
                      companyName: dto.companyName,
                    }),
                    ...(dto.gstNumber !== undefined && {
                      gstNumber: dto.gstNumber,
                    }),
                    ...(dto.businessType !== undefined && {
                      businessType: dto.businessType,
                    }),
                  },
                },
              },
            }
          : {}),
      },
    });

    return this.findOne(id);
  }

  async setStatus(id: string, status: CustomerStatus) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.prisma.customer.update({
      where: { id },
      data: { status },
    });

    return this.findOne(id);
  }

  async upgradeMembership(id: string, dto: AdminUpgradeMembershipDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const plan = await this.prisma.membershipPlan.findFirst({
      where: {
        OR: [{ id: dto.planId }, { name: { equals: dto.planName, mode: 'insensitive' } }],
        status: 'ACTIVE',
      },
    });
    if (!plan) throw new BadRequestException('Membership plan not found');

    await this.prisma.customerMembership.updateMany({
      where: { customerId: id, status: MembershipStatus.ACTIVE },
      data: { status: MembershipStatus.CANCELLED },
    });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

    const membership = await this.prisma.customerMembership.create({
      data: {
        customerId: id,
        planId: plan.id,
        purchaseDate: new Date(),
        expiryDate,
        renewalDate: expiryDate,
        status: MembershipStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
      },
      include: { plan: true },
    });

    await this.prisma.customer.update({
      where: { id },
      data: { membershipId: membership.id, isMember: true },
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), status: CustomerStatus.INACTIVE },
    });
  }

  private mapListItem(c: {
    id: string;
    phone: string;
    email: string | null;
    fullName: string | null;
    status: string;
    createdAt: Date;
    profile: {
      companyName: string | null;
      gstNumber: string | null;
    } | null;
    loyaltyAccount: {
      availablePoints: number;
      tier: string;
      currentPoints: number;
    } | null;
    memberships: Array<{ plan: { name: string } }>;
    deviceSessions: Array<{ lastLogin: Date }>;
    _count: { orders: number; addresses: number };
  }) {
    return {
      id: c.id,
      name: c.fullName,
      phone: c.phone,
      email: c.email,
      company: c.profile?.companyName ?? null,
      gst: c.profile?.gstNumber ?? null,
      membership: c.memberships[0]?.plan.name ?? c.loyaltyAccount?.tier ?? null,
      status: c.status,
      createdAt: c.createdAt,
      lastLogin: c.deviceSessions[0]?.lastLogin ?? null,
      orders: c._count.orders,
      wallet: {
        balance: c.loyaltyAccount?.availablePoints ?? 0,
        tier: c.loyaltyAccount?.tier ?? null,
      },
      addresses: c._count.addresses,
    };
  }

  private mapDetail(customer: {
    id: string;
    phone: string;
    email: string | null;
    fullName: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    profileCompleted: boolean;
    roleSelected: boolean;
    language: string;
    profile: unknown;
    addresses: unknown[];
    loyaltyAccount: unknown;
    memberships: unknown[];
    orders: unknown[];
    deviceSessions: Array<{ lastLogin: Date; deviceId: string | null; platform: string }>;
    role: unknown;
  }) {
    return {
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      status: customer.status,
      language: customer.language,
      profileCompleted: customer.profileCompleted,
      roleSelected: customer.roleSelected,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      lastLogin: customer.deviceSessions[0]?.lastLogin ?? null,
      profile: customer.profile,
      role: customer.role,
      addresses: customer.addresses,
      loyalty: customer.loyaltyAccount,
      wallet: customer.loyaltyAccount,
      memberships: customer.memberships,
      orders: customer.orders,
      deviceSessions: customer.deviceSessions,
    };
  }
}
