import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  AdminRole,
  CustomerStatus,
  MembershipStatus,
  PaymentStatus,
  Prisma,
  RegistrationSource,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { startOfDayIst, addDays } from '../../hub/common/hub-date.util';
import {
  isValidIndianMobile,
  normalizePhone,
} from '../../common/utils/phone.util';
import type {
  AdminAssignCustomerDto,
  AdminBulkAssignDto,
  AdminBulkStatusDto,
  AdminCustomerQueryDto,
  AdminInviteCustomerDto,
  AdminUpdateCustomerDto,
  AdminUpgradeMembershipDto,
} from './dto/admin-customers.dto';

const assignmentInclude = {
  assignedHub: { select: { id: true, name: true, city: true, state: true } },
  assignedExecutive: {
    select: { id: true, fullName: true, email: true, phone: true, role: true },
  },
} as const;

const listInclude = {
  profile: true,
  loyaltyAccount: {
    select: { availablePoints: true, currentPoints: true },
  },
  addresses: {
    where: { deletedAt: null },
    orderBy: { isDefault: 'desc' as const },
    take: 1,
    select: { city: true, state: true },
  },
  deviceSessions: {
    orderBy: { lastLogin: 'desc' as const },
    take: 1,
    select: { lastLogin: true },
  },
  orders: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { createdAt: true },
  },
  ...assignmentInclude,
  _count: { select: { orders: true, addresses: true } },
} satisfies Prisma.CustomerInclude;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseIdList(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function resolveApiStatus(raw?: string): CustomerStatus | 'PENDING_VERIFICATION' | undefined {
  if (!raw || raw === 'all') return undefined;
  const status = raw.toUpperCase();
  if (status === 'BLOCKED') return CustomerStatus.SUSPENDED;
  if (status === 'PENDING_VERIFICATION') return 'PENDING_VERIFICATION';
  if (
    status === CustomerStatus.ACTIVE ||
    status === CustomerStatus.INACTIVE ||
    status === CustomerStatus.SUSPENDED
  ) {
    return status;
  }
  return undefined;
}

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const startOfToday = startOfDayIst();

    const [total, active, blocked, inactive, pendingVerification, newToday] =
      await Promise.all([
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
          where: {
            deletedAt: null,
            isVerified: false,
            status: { not: CustomerStatus.SUSPENDED },
          },
        }),
        this.prisma.customer.count({
          where: { deletedAt: null, createdAt: { gte: startOfToday } },
        }),
      ]);

    return {
      total,
      active,
      pendingVerification,
      blocked,
      inactive,
      newToday,
    };
  }

  async getFilterOptions() {
    const [hubs, executives, states] = await Promise.all([
      this.prisma.hub.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, city: true, state: true, hubType: true },
      }),
      this.prisma.adminUser.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: AdminRole.CUSTOMER_EXECUTIVE,
        },
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, email: true },
      }),
      this.prisma.address.findMany({
        where: { deletedAt: null, state: { not: '' } },
        distinct: ['state'],
        select: { state: true },
        orderBy: { state: 'asc' },
      }),
    ]);

    return {
      hubs: hubs.map((hub) => ({
        value: hub.id,
        label: hub.name,
        city: hub.city,
        state: hub.state,
        hubType: hub.hubType,
      })),
      executives: executives.map((executive) => ({
        value: executive.id,
        label: executive.fullName || executive.email,
      })),
      states: states
        .map((row) => row.state)
        .filter((state): state is string => Boolean(state))
        .map((state) => ({ value: state, label: state })),
    };
  }

  async findAll(query: AdminCustomerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: listInclude,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.mapListItem(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async exportCsv(query: AdminCustomerQueryDto): Promise<string> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.customer.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' },
      include: listInclude,
    });

    const header = [
      'Customer ID',
      'Name',
      'Phone',
      'Email',
      'Company',
      'GST',
      'Customer Type',
      'Status',
      'Verified',
      'City',
      'State',
      'Assigned Hub',
      'Assigned Executive',
      'Orders',
      'Created',
      'Last Login',
    ];

    const lines = rows.map((row) => {
      const item = this.mapListItem(row);
      return [
        item.id,
        item.name,
        item.phone,
        item.email,
        item.company,
        item.gst,
        item.customerType,
        item.status,
        item.isVerified ? 'Yes' : 'No',
        item.city,
        item.state,
        item.assignedHubName,
        item.assignedExecutiveName,
        item.orders,
        item.createdAt.toISOString(),
        item.lastLogin ? item.lastLogin.toISOString() : '',
      ]
        .map(csvCell)
        .join(',');
    });

    return [header.map(csvCell).join(','), ...lines].join('\n');
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
        orders: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { hub: { select: { id: true, name: true } } },
        },
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
        throw new ConflictException(
          'Email already in use by another customer',
        );
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

  async assign(id: string, dto: AdminAssignCustomerDto, actorId?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    await this.assertHub(dto.hubId);
    await this.assertExecutive(dto.executiveId);

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

  async bulkSetStatus(dto: AdminBulkStatusDto) {
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: dto.ids }, deletedAt: null },
      select: { id: true },
    });
    if (customers.length !== dto.ids.length) {
      throw new NotFoundException('One or more customers were not found');
    }

    await this.prisma.customer.updateMany({
      where: { id: { in: dto.ids } },
      data: { status: dto.status },
    });

    return { updated: customers.length, status: dto.status };
  }

  async bulkAssign(dto: AdminBulkAssignDto, actorId?: string) {
    if (dto.hubId === undefined && dto.executiveId === undefined) {
      throw new BadRequestException('Provide a hub or executive to assign');
    }

    await this.assertHub(dto.hubId);
    await this.assertExecutive(dto.executiveId);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: dto.ids }, deletedAt: null },
      select: {
        id: true,
        assignedHubId: true,
        assignedExecutiveId: true,
      },
    });
    if (customers.length !== dto.ids.length) {
      throw new NotFoundException('One or more customers were not found');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const customer of customers) {
        const nextHubId =
          dto.hubId === undefined ? customer.assignedHubId : dto.hubId;
        const nextExecutiveId =
          dto.executiveId === undefined
            ? customer.assignedExecutiveId
            : dto.executiveId;

        await tx.customer.update({
          where: { id: customer.id },
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
              customerId: customer.id,
              executiveId: nextExecutiveId,
              previousExecutiveId: customer.assignedExecutiveId,
              hubId: nextHubId,
              action: nextExecutiveId ? 'ASSIGNED' : 'REMOVED',
              reason: dto.reason,
              assignedById: actorId,
            },
          });
        }
      }
    });

    return { updated: customers.length };
  }

  async invite(dto: AdminInviteCustomerDto, actorId: string) {
    if (!isValidIndianMobile(dto.phone)) {
      throw new BadRequestException('Invalid Indian mobile number');
    }
    const phone = normalizePhone(dto.phone);

    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        'Customer already registered with this phone number',
      );
    }

    if (dto.email) {
      const emailTaken = await this.prisma.customer.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (emailTaken) {
        throw new ConflictException('Email already in use');
      }
    }

    await this.assertHub(dto.hubId);
    await this.assertExecutive(dto.executiveId);

    const created = await this.prisma.customer.create({
      data: {
        phone,
        fullName: dto.fullName.trim(),
        email: dto.email ?? null,
        isVerified: false,
        status: CustomerStatus.ACTIVE,
        assignedHubId: dto.hubId ?? null,
        assignedExecutiveId: dto.executiveId ?? null,
        registeredByUserId: actorId,
        registrationSource: RegistrationSource.SUPER_ADMIN,
        profile: dto.companyName || dto.gstNumber || dto.businessType
          ? {
              create: {
                companyName: dto.companyName ?? null,
                gstNumber: dto.gstNumber ?? null,
                businessType: dto.businessType ?? null,
              },
            }
          : undefined,
      },
    });

    return this.findOne(created.id);
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

  private buildWhere(query: AdminCustomerQueryDto): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    const ids = parseIdList(query.ids).filter(isUuid);
    if (ids.length > 0) {
      where.id = { in: ids };
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
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

    const status = resolveApiStatus(query.status);
    if (status === 'PENDING_VERIFICATION') {
      where.isVerified = false;
      where.status = { not: CustomerStatus.SUSPENDED };
    } else if (status) {
      where.status = status;
    }

    if (query.customerType && query.customerType !== 'all') {
      where.profile = {
        is: {
          businessType: {
            contains: query.customerType.replaceAll('_', ' '),
            mode: 'insensitive',
          },
        },
      };
    }

    if (query.hubId && query.hubId !== 'all') {
      where.assignedHubId = query.hubId;
    }

    if (query.executiveId && query.executiveId !== 'all') {
      where.assignedExecutiveId = query.executiveId;
    }

    if (query.state && query.state !== 'all') {
      where.addresses = {
        some: {
          deletedAt: null,
          state: { equals: query.state, mode: 'insensitive' },
        },
      };
    }

    if (query.city?.trim()) {
      where.addresses = {
        some: {
          deletedAt: null,
          ...(query.state && query.state !== 'all'
            ? { state: { equals: query.state, mode: 'insensitive' } }
            : {}),
          city: { contains: query.city.trim(), mode: 'insensitive' },
        },
      };
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = startOfDayIst(new Date(query.createdFrom));
      }
      if (query.createdTo) {
        where.createdAt.lt = addDays(
          startOfDayIst(new Date(query.createdTo)),
          1,
        );
      }
    }

    return where;
  }

  private async assertHub(hubId?: string | null) {
    if (!hubId) return;
    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
    });
    if (!hub) throw new BadRequestException('Hub not found');
  }

  private async assertExecutive(executiveId?: string | null) {
    if (!executiveId) return;
    const executive = await this.prisma.adminUser.findFirst({
      where: {
        id: executiveId,
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

  private mapListItem(c: {
    id: string;
    phone: string;
    email: string | null;
    fullName: string | null;
    status: string;
    isVerified?: boolean;
    createdAt: Date;
    assignedHubId?: string | null;
    assignedExecutiveId?: string | null;
    assignedHub?: { id: string; name: string } | null;
    assignedExecutive?: { id: string; fullName: string } | null;
    profile: {
      companyName: string | null;
      gstNumber: string | null;
      businessType?: string | null;
    } | null;
    loyaltyAccount: {
      availablePoints: number;
      currentPoints: number;
    } | null;
    addresses?: Array<{ city: string; state: string }>;
    deviceSessions: Array<{ lastLogin: Date }>;
    orders?: Array<{ createdAt: Date }>;
    isMember?: boolean;
    _count: { orders: number; addresses: number };
  }) {
    return {
      id: c.id,
      name: c.fullName,
      phone: c.phone,
      email: c.email,
      company: c.profile?.companyName ?? null,
      gst: c.profile?.gstNumber ?? null,
      customerType: c.profile?.businessType ?? null,
      isVerified: c.isVerified ?? false,
      isMember: c.isMember ?? false,
      city: c.addresses?.[0]?.city ?? null,
      state: c.addresses?.[0]?.state ?? null,
      status: c.status,
      createdAt: c.createdAt,
      lastLogin: c.deviceSessions[0]?.lastLogin ?? null,
      lastOrderAt: c.orders?.[0]?.createdAt ?? null,
      orders: c._count.orders,
      wallet: {
        balance: c.loyaltyAccount?.availablePoints ?? 0,
      },
      loyaltyPoints: c.loyaltyAccount?.availablePoints ?? 0,
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
    isVerified?: boolean;
    createdAt: Date;
    updatedAt: Date;
    profileCompleted: boolean;
    roleSelected: boolean;
    language: string;
    assignedHubId?: string | null;
    assignedExecutiveId?: string | null;
    assignedHub?: {
      id: string;
      name: string;
      city?: string;
      state?: string;
    } | null;
    assignedExecutive?: {
      id: string;
      fullName: string;
      email?: string | null;
      phone?: string | null;
    } | null;
    profile: unknown;
    addresses: unknown[];
    loyaltyAccount: unknown;
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
      isVerified: customer.isVerified ?? false,
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
      assignedExecutivePhone: customer.assignedExecutive?.phone ?? null,
      assignedExecutiveEmail: customer.assignedExecutive?.email ?? null,
      profile: customer.profile,
      role: customer.role,
      addresses: customer.addresses,
      loyalty: customer.loyaltyAccount,
      wallet: customer.loyaltyAccount,
      orders: customer.orders,
      deviceSessions: customer.deviceSessions,
      assignmentHistory: customer.executiveAssignmentHistory ?? [],
    };
  }
}
