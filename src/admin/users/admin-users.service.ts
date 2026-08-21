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
import { AuditService } from '../audit/audit.service';
import type {
  AdminUserQueryDto,
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
          _count: { select: { assignedCustomers: true } },
        },
      }),
      this.prisma.adminUser.count({ where }),
    ]);

    return {
      data: rows.map((row) =>
        this.mapUser(row, row._count?.assignedCustomers ?? 0),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { assignedCustomers: true } },
      },
    });
    if (!user) throw new NotFoundException('Admin user not found');
    return this.mapUser(user, user._count.assignedCustomers);
  }

  async create(dto: CreateAdminUserDto, actorId: string, actorEmail: string) {
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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.adminUser.create({
      data: {
        fullName: dto.name.trim(),
        email,
        phone: dto.phone,
        role: dto.role,
        passwordHash,
        isActive: true,
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

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { fullName: dto.name.trim() }),
        ...(dto.email !== undefined && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
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
      lastLoginAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    assignedCustomers = 0,
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
      assignedCustomers,
    };
  }
}
