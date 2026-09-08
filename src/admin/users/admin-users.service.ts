import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminRole, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { startOfDayIst } from '../../hub/common/hub-date.util';
import { AuditService } from '../audit/audit.service';
import type {
  AdminUserQueryDto,
  AssignAdminUserHubDto,
  ChangeAdminUserRoleDto,
  CreateAdminUserDto,
  ResetAdminUserPasswordDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-users.dto';
import {
  AdminUserDisplayStatus,
  AdminUserStatusAction,
} from './dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AdminUserWhereInput = { deletedAt: null };

    if (query.role) where.role = query.role;

    if (query.status === AdminUserDisplayStatus.ACTIVE) {
      where.isActive = true;
    } else if (query.status === AdminUserDisplayStatus.INACTIVE) {
      where.isActive = false;
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.hubId) where.assignedHubId = query.hubId;
    if (query.region) {
      where.assignedHub = {
        state: { equals: query.region, mode: 'insensitive' },
      };
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        const end = new Date(query.createdTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedHub: {
            select: { id: true, name: true, city: true, state: true, hubType: true },
          },
          _count: { select: { assignedCustomers: true } },
        },
      }),
      this.prisma.adminUser.count({ where }),
    ]);

    const userIds = rows.map((row) => row.id);
    const startOfToday = startOfDayIst();
    const [todayOrders, totalOrders, todayCalls] = userIds.length
      ? await Promise.all([
          this.prisma.order.groupBy({
            by: ['createdByAdminId'],
            where: {
              createdByAdminId: { in: userIds },
              deletedAt: null,
              createdAt: { gte: startOfToday },
            },
            _count: { _all: true },
          }),
          this.prisma.order.groupBy({
            by: ['createdByAdminId'],
            where: {
              createdByAdminId: { in: userIds },
              deletedAt: null,
            },
            _count: { _all: true },
          }),
          this.prisma.supportTicket.groupBy({
            by: ['assignedExecutiveId'],
            where: {
              assignedExecutiveId: { in: userIds },
              deletedAt: null,
              updatedAt: { gte: startOfToday },
            },
            _count: { _all: true },
          }),
        ])
      : [[], [], []];

    const todayOrderMap = new Map(
      todayOrders.map((row) => [row.createdByAdminId, row._count._all]),
    );
    const totalOrderMap = new Map(
      totalOrders.map((row) => [row.createdByAdminId, row._count._all]),
    );
    const todayCallMap = new Map(
      todayCalls.map((row) => [row.assignedExecutiveId, row._count._all]),
    );

    return {
      data: rows.map((row) =>
        this.mapUser(row, {
          assignedCustomers: row._count?.assignedCustomers ?? 0,
          todayOrders: todayOrderMap.get(row.id) ?? 0,
          totalOrders: totalOrderMap.get(row.id) ?? 0,
          todayCalls: todayCallMap.get(row.id) ?? 0,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getStats(role?: string) {
    const parsedRole = Object.values(AdminRole).includes(role as AdminRole)
      ? (role as AdminRole)
      : undefined;
    const startOfToday = startOfDayIst();
    const monthStart = new Date(startOfToday);
    monthStart.setDate(1);

    const baseWhere: Prisma.AdminUserWhereInput = {
      deletedAt: null,
      ...(parsedRole ? { role: parsedRole } : {}),
    };

    const [total, available, joinedThisMonth, ordersCreatedToday, callsAssisted] =
      await Promise.all([
        this.prisma.adminUser.count({ where: baseWhere }),
        this.prisma.adminUser.count({
          where: { ...baseWhere, isActive: true },
        }),
        this.prisma.adminUser.count({
          where: { ...baseWhere, createdAt: { gte: monthStart } },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            createdAt: { gte: startOfToday },
            orderSource: 'CUSTOMER_EXECUTIVE',
          },
        }),
        this.prisma.supportTicket.count({
          where: {
            deletedAt: null,
            updatedAt: { gte: startOfToday },
            assignedExecutiveId: { not: null },
            ...(parsedRole
              ? {
                  assignedExecutive: { role: parsedRole, deletedAt: null },
                }
              : {}),
          },
        }),
      ]);

    return {
      totalExecutives: total,
      availableToday: available,
      ordersCreatedToday,
      customerCallsAssisted: callsAssisted,
      joinedThisMonth,
    };
  }

  async exportCsv(query: AdminUserQueryDto): Promise<string> {
    const result = await this.findAll({ ...query, page: 1, limit: 2000 });
    const header = [
      'ID',
      'Name',
      'Email',
      'Phone',
      'Role',
      'Status',
      'Hub',
      'Region',
      'Assigned Customers',
      'Orders Today',
      'Total Orders',
      'Created',
    ];
    const lines = result.data.map((row) =>
      [
        row.id,
        row.fullName,
        row.email,
        row.phone ?? '',
        row.role,
        row.status,
        row.assignedHubName ?? '',
        row.assignedHubState ?? '',
        row.assignedCustomers,
        row.todayOrders,
        row.totalOrders,
        row.createdAt,
      ]
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header.map((h) => `"${h}"`).join(','), ...lines].join('\n');
  }

  async findOne(id: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignedHub: {
          select: { id: true, name: true, city: true, state: true, hubType: true },
        },
        _count: { select: { assignedCustomers: true } },
      },
    });
    if (!user) throw new NotFoundException('Admin user not found');

    const startOfToday = startOfDayIst();
    const [todayOrders, totalOrders, todayCalls] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdByAdminId: id,
          deletedAt: null,
          createdAt: { gte: startOfToday },
        },
      }),
      this.prisma.order.count({
        where: { createdByAdminId: id, deletedAt: null },
      }),
      this.prisma.supportTicket.count({
        where: {
          assignedExecutiveId: id,
          deletedAt: null,
          updatedAt: { gte: startOfToday },
        },
      }),
    ]);

    return this.mapUser(user, {
      assignedCustomers: user._count.assignedCustomers,
      todayOrders,
      totalOrders,
      todayCalls,
    });
  }

  async create(dto: CreateAdminUserDto, actorId: string, actorEmail: string) {
    const fullName = (dto.name ?? dto.fullName ?? '').trim();
    if (fullName.length < 2) {
      throw new BadRequestException('Name is required');
    }

    const email = dto.email.toLowerCase();

    const existing = await this.prisma.adminUser.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    if (dto.hubId) {
      await this.assertHub(dto.hubId);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.adminUser.create({
      data: {
        fullName,
        email,
        phone: dto.phone,
        role: dto.role,
        passwordHash,
        isActive: true,
        assignedHubId: dto.hubId ?? null,
      },
      include: {
        assignedHub: {
          select: { id: true, name: true, city: true, state: true, hubType: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'CREATE',
      resource: 'AdminUser',
      resourceId: created.id,
      newValue: {
        fullName: created.fullName,
        email: created.email,
        phone: created.phone,
        role: created.role,
        assignedHubId: created.assignedHubId,
      },
    });

    return this.mapUser(created);
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
    actorId: string,
    actorEmail: string,
  ) {
    const existing = await this.getUserOrThrow(id);

    if (dto.email) {
      const email = dto.email.toLowerCase();
      const duplicate = await this.prisma.adminUser.findFirst({
        where: {
          email,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new ConflictException('Email already in use');
      }
    }

    if (dto.hubId) {
      await this.assertHub(dto.hubId);
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...((dto.name ?? dto.fullName) !== undefined && {
          fullName: (dto.name ?? dto.fullName ?? '').trim(),
        }),
        ...(dto.email !== undefined && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.hubId !== undefined && { assignedHubId: dto.hubId }),
      },
      include: {
        assignedHub: {
          select: { id: true, name: true, city: true, state: true, hubType: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'UPDATE',
      resource: 'AdminUser',
      resourceId: id,
      oldValue: this.auditSnapshot(existing),
      newValue: dto,
    });

    return this.mapUser(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateAdminUserStatusDto,
    actorId: string,
    actorEmail: string,
  ) {
    if (id === actorId && dto.action === AdminUserStatusAction.DEACTIVATE) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const existing = await this.getUserOrThrow(id);
    const isActive = dto.action === AdminUserStatusAction.ACTIVATE;

    if (existing.isActive === isActive) {
      throw new BadRequestException(
        isActive ? 'User is already active' : 'User is already inactive',
      );
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: { isActive },
    });

    if (!isActive) {
      await this.revokeRefreshTokens(id);
    }

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'UPDATE',
      resource: 'AdminUser',
      resourceId: id,
      oldValue: { isActive: existing.isActive },
      newValue: { isActive },
    });

    return this.mapUser(updated);
  }

  async resetPassword(
    id: string,
    dto: ResetAdminUserPasswordDto,
    actorId: string,
    actorEmail: string,
  ) {
    await this.getUserOrThrow(id);

    const password =
      dto.password?.trim() ||
      `Admin@${Math.random().toString(36).slice(2, 8)}1`;
    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash },
    });

    await this.revokeRefreshTokens(id);

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'UPDATE',
      resource: 'AdminUser',
      resourceId: id,
      newValue: { passwordReset: true },
    });

    return { userId: id, temporaryPassword: password };
  }

  async changeRole(
    id: string,
    dto: ChangeAdminUserRoleDto,
    actorId: string,
    actorEmail: string,
  ) {
    const existing = await this.getUserOrThrow(id);

    if (existing.role === dto.role) {
      throw new BadRequestException('User already has this role');
    }

    if (id === actorId && existing.role === AdminRole.SUPER_ADMIN) {
      await this.ensureAnotherSuperAdmin(id);
    }

    if (existing.role === AdminRole.SUPER_ADMIN) {
      await this.ensureAnotherSuperAdmin(id);
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: { role: dto.role },
    });

    await this.revokeRefreshTokens(id);

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'ASSIGN',
      resource: 'AdminUser',
      resourceId: id,
      oldValue: { role: existing.role },
      newValue: { role: dto.role },
    });

    return this.mapUser(updated);
  }

  async remove(id: string, actorId: string, actorEmail: string) {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const existing = await this.getUserOrThrow(id);

    if (existing.role === AdminRole.SUPER_ADMIN) {
      await this.ensureAnotherSuperAdmin(id);
    }

    const deleted = await this.prisma.adminUser.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await this.revokeRefreshTokens(id);

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'DELETE',
      resource: 'AdminUser',
      resourceId: id,
      oldValue: this.auditSnapshot(existing),
    });

    return this.mapUser(deleted);
  }

  async assignHub(
    id: string,
    dto: AssignAdminUserHubDto,
    actorId: string,
    actorEmail: string,
  ) {
    const existing = await this.getUserOrThrow(id);
    if (dto.hubId) {
      await this.assertHub(dto.hubId);
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: { assignedHubId: dto.hubId ?? null },
      include: {
        assignedHub: {
          select: { id: true, name: true, city: true, state: true, hubType: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: actorId,
      adminEmail: actorEmail,
      action: 'UPDATE',
      resource: 'AdminUserAssignment',
      resourceId: id,
      oldValue: { assignedHubId: existing.assignedHubId },
      newValue: { assignedHubId: dto.hubId ?? null },
    });

    return this.mapUser(updated);
  }

  private async assertHub(hubId: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
    });
    if (!hub) throw new BadRequestException('Hub not found');
  }

  private async getUserOrThrow(id: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) throw new NotFoundException('Admin user not found');
    return user;
  }

  private async ensureAnotherSuperAdmin(excludeId: string) {
    const count = await this.prisma.adminUser.count({
      where: {
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
        deletedAt: null,
        NOT: { id: excludeId },
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'At least one active SUPER_ADMIN must remain',
      );
    }
  }

  private async revokeRefreshTokens(adminUserId: string) {
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminUserId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  private auditSnapshot(user: {
    fullName: string;
    email: string;
    phone: string | null;
    role: AdminRole;
    isActive: boolean;
  }) {
    return {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
    };
  }

  private mapUser(
    user: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      role: AdminRole;
      isActive: boolean;
      assignedHubId?: string | null;
      lastLoginAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      assignedHub?: {
        id: string;
        name: string;
        city: string;
        state: string;
        hubType?: string | null;
      } | null;
    },
    extras: {
      assignedCustomers?: number;
      todayOrders?: number;
      totalOrders?: number;
      todayCalls?: number;
    } = {},
  ) {
    return {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.isActive
        ? AdminUserDisplayStatus.ACTIVE
        : AdminUserDisplayStatus.INACTIVE,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      assignedHubId: user.assignedHubId ?? user.assignedHub?.id ?? null,
      assignedHubName: user.assignedHub?.name ?? null,
      assignedHubCity: user.assignedHub?.city ?? null,
      assignedHubState: user.assignedHub?.state ?? null,
      assignedHubType: user.assignedHub?.hubType ?? null,
      assignedCustomers: extras.assignedCustomers ?? 0,
      todayOrders: extras.todayOrders ?? 0,
      totalOrders: extras.totalOrders ?? 0,
      todayCalls: extras.todayCalls ?? 0,
    };
  }
}
