import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  AdminRole,
  CustomerStatus,
  MembershipStatus,
  PaymentStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  AdminAssignCustomerDto,
  AdminCustomerQueryDto,
  AdminUpdateCustomerDto,
  AdminUpgradeMembershipDto,
} from './dto/admin-customers.dto';

const assignmentInclude = {
  assignedHub: { select: { id: true, name: true, city: true, state: true } },
  assignedExecutive: {
    select: { id: true, fullName: true, email: true, phone: true, role: true },
  },
} as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, active, blocked, inactive, newToday] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.customer.count({
        where: { deletedAt: null, status: CustomerStatus.ACTIVE },
      }),
      this.prisma.customer.count({
        where: { deletedAt: null, status: CustomerStatus.SUSPENDED },
      }),
      this.prisma.customer.count({
        where: { deletedAt: null, status: CustomerStatus.INACTIVE },
      }),
      this.prisma.customer.count({
        where: { deletedAt: null, createdAt: { gte: startOfToday } },
      }),
    ]);

    return {
      total,
      active,
      // UI label: pending verification — map unverified active-ish customers
      pendingVerification: await this.prisma.customer.count({
        where: {
          deletedAt: null,
          isVerified: false,
          status: { not: CustomerStatus.SUSPENDED },
        },
      }),
      blocked,
      inactive,
      newToday,
    };
  }

  async findAll(query: AdminCustomerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (query.search) {
      const term = query.search.trim();
      where['OR'] = [
        { phone: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        ...(isUuid(term) ? [{ id: { equals: term } }] : []),
        {
          profile: {
            companyName: { contains: term, mode: 'insensitive' },
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

    if (query.hubId) {
      where['assignedHubId'] = query.hubId;
    }

    if (query.executiveId) {
      where['assignedExecutiveId'] = query.executiveId;
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
            select: { availablePoints: true, currentPoints: true },
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
          ...assignmentInclude,
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
        ...assignmentInclude,
        executiveAssignmentHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            executive: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
          },
        },
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

    if (dto.email) {
      const existing = await this.prisma.customer.findFirst({
        where: {
          email: dto.email,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (existing) {
        throw new BadRequestException('Email already in use by another customer');
      }
    }

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

  async assign(
    id: string,
    dto: AdminAssignCustomerDto,
    actorId?: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.hubId) {
      const hub = await this.prisma.hub.findFirst({
        where: { id: dto.hubId, deletedAt: null },
      });
      if (!hub) throw new BadRequestException('Hub not found');
    }

    if (dto.executiveId) {
      const executive = await this.prisma.adminUser.findFirst({
        where: {
          id: dto.executiveId,
          deletedAt: null,
          isActive: true,
          role: AdminRole.CUSTOMER_EXECUTIVE,
        },
      });
      if (!executive) {
        throw new BadRequestException(
          'Customer executive not found or inactive',
        );
      }
    }

    const nextHubId =
      dto.hubId === undefined ? customer.assignedHubId : dto.hubId;
    const nextExecutiveId =
      dto.executiveId === undefined
        ? customer.assignedExecutiveId
        : dto.executiveId;

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data: {
          assignedHubId: nextHubId,
          assignedExecutiveId: nextExecutiveId,
        },
      });

      if (
        dto.executiveId !== undefined &&
        dto.executiveId !== customer.assignedExecutiveId
      ) {
        await tx.customerExecutiveAssignmentHistory.create({
          data: {
            customerId: id,
            executiveId: nextExecutiveId,
            previousExecutiveId: customer.assignedExecutiveId,
            hubId: nextHubId,
            action: nextExecutiveId ? 'ASSIGNED' : 'REMOVED',
            reason: dto.reason,
            notes: dto.notes,
            assignedById: actorId,
          },
        });
      }
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
        OR: [
          { id: dto.planId },
          { name: { equals: dto.planName, mode: 'insensitive' } },
        ],
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
    assignedHubId?: string | null;
    assignedExecutiveId?: string | null;
    assignedHub?: { id: string; name: string } | null;
    assignedExecutive?: { id: string; fullName: string } | null;
    profile: {
      companyName: string | null;
      gstNumber: string | null;
    } | null;
    loyaltyAccount: {
      availablePoints: number;
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
      membership: c.memberships[0]?.plan.name ?? null,
      status: c.status,
      createdAt: c.createdAt,
      lastLogin: c.deviceSessions[0]?.lastLogin ?? null,
      orders: c._count.orders,
      wallet: {
        balance: c.loyaltyAccount?.availablePoints ?? 0,
      },
      addresses: c._count.addresses,
      assignedHubId: c.assignedHubId ?? null,
      assignedHubName: c.assignedHub?.name ?? null,
      assignedExecutiveId: c.assignedExecutiveId ?? null,
      assignedExecutiveName: c.assignedExecutive?.fullName ?? null,
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
    assignedHubId?: string | null;
    assignedExecutiveId?: string | null;
    assignedHub?: { id: string; name: string; city?: string; state?: string } | null;
    assignedExecutive?: {
      id: string;
      fullName: string;
      email?: string | null;
      phone?: string | null;
    } | null;
    profile: unknown;
    addresses: unknown[];
    loyaltyAccount: unknown;
    memberships: unknown[];
    orders: unknown[];
    deviceSessions: Array<{
      lastLogin: Date;
      deviceId: string | null;
      platform: string;
    }>;
    role: unknown;
    executiveAssignmentHistory?: unknown[];
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
      assignedHubId: customer.assignedHubId ?? null,
      assignedHubName: customer.assignedHub?.name ?? null,
      assignedExecutiveId: customer.assignedExecutiveId ?? null,
      assignedExecutiveName: customer.assignedExecutive?.fullName ?? null,
      profile: customer.profile,
      role: customer.role,
      addresses: customer.addresses,
      loyalty: customer.loyaltyAccount,
      wallet: customer.loyaltyAccount,
      memberships: customer.memberships,
      orders: customer.orders,
      deviceSessions: customer.deviceSessions,
      assignmentHistory: customer.executiveAssignmentHistory ?? [],
    };
  }
}
