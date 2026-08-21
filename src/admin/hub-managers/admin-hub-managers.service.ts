import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { HubRole, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CreateHubManagerDto,
  HubManagerQueryDto,
  ResetHubManagerPasswordDto,
  TransferHubManagerDto,
  UpdateHubManagerDto,
} from './dto/admin-hub-managers.dto';

@Injectable()
export class AdminHubManagersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: HubManagerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.HubUserWhereInput = {
      deletedAt: null,
      role: HubRole.HUB_MANAGER,
    };

    if (query.hubId) where.hubId = query.hubId;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { employeeId: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.hubUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          hub: {
            select: {
              id: true,
              code: true,
              name: true,
              city: true,
              state: true,
            },
          },
        },
      }),
      this.prisma.hubUser.count({ where }),
    ]);

    return {
      data: data.map((row) => this.mapManager(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const manager = await this.getManagerOrThrow(id);
    return this.mapManager(manager);
  }

  async create(dto: CreateHubManagerDto, adminId: string, adminEmail: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id: dto.hubId, deletedAt: null, isActive: true },
    });
    if (!hub) throw new NotFoundException('Assigned hub not found or inactive');

    const employeeId = dto.employeeId
      ? dto.employeeId.trim().toLowerCase()
      : await this.nextEmployeeId();

    const existing = await this.prisma.hubUser.findFirst({
      where: {
        OR: [
          { employeeId },
          ...(dto.email ? [{ email: dto.email.toLowerCase() }] : []),
        ],
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictException('Employee ID or email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.hubUser.create({
      data: {
        employeeId,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role ?? HubRole.HUB_MANAGER,
        hubId: dto.hubId,
        isActive: dto.isActive ?? true,
      },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'HubManager',
      resourceId: created.id,
      newValue: { employeeId, hubId: dto.hubId, role: created.role },
    });

    return {
      ...this.mapManager(created),
      credentials: { employeeId, password: dto.password },
    };
  }

  async update(
    id: string,
    dto: UpdateHubManagerDto,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getManagerOrThrow(id);
    const updated = await this.prisma.hubUser.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.email !== undefined && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubManager',
      resourceId: id,
      newValue: dto,
    });

    return this.mapManager(updated);
  }

  async transferHub(
    id: string,
    dto: TransferHubManagerDto,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getManagerOrThrow(id);
    const hub = await this.prisma.hub.findFirst({
      where: { id: dto.hubId, deletedAt: null, isActive: true },
    });
    if (!hub) throw new NotFoundException('Target hub not found or inactive');

    const updated = await this.prisma.hubUser.update({
      where: { id },
      data: { hubId: dto.hubId },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'ASSIGN',
      resource: 'HubManager',
      resourceId: id,
      newValue: { hubId: dto.hubId, reason: dto.reason },
    });

    return this.mapManager(updated);
  }

  async deactivate(id: string, adminId: string, adminEmail: string) {
    await this.getManagerOrThrow(id);
    const updated = await this.prisma.hubUser.update({
      where: { id },
      data: { isActive: false },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });

    await this.prisma.hubRefreshToken.updateMany({
      where: { hubUserId: id, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubManager',
      resourceId: id,
      newValue: { isActive: false },
    });

    return this.mapManager(updated);
  }

  async reactivate(id: string, adminId: string, adminEmail: string) {
    await this.getManagerOrThrow(id);
    const updated = await this.prisma.hubUser.update({
      where: { id },
      data: { isActive: true },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubManager',
      resourceId: id,
      newValue: { isActive: true },
    });

    return this.mapManager(updated);
  }

  async resetPassword(
    id: string,
    dto: ResetHubManagerPasswordDto,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getManagerOrThrow(id);
    const password =
      dto.password?.trim() || `Hub@${Math.random().toString(36).slice(2, 8)}1`;
    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.hubUser.update({
      where: { id },
      data: { passwordHash },
    });

    await this.prisma.hubRefreshToken.updateMany({
      where: { hubUserId: id, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'HubManager',
      resourceId: id,
      newValue: { passwordReset: true },
    });

    return { managerId: id, temporaryPassword: password };
  }

  async listHubs() {
    return this.prisma.hub.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        city: true,
        state: true,
        pincode: true,
        phone: true,
      },
    });
  }

  private async getManagerOrThrow(id: string) {
    const manager = await this.prisma.hubUser.findFirst({
      where: { id, deletedAt: null, role: HubRole.HUB_MANAGER },
      include: {
        hub: {
          select: { id: true, code: true, name: true, city: true, state: true },
        },
      },
    });
    if (!manager) throw new NotFoundException('Hub manager not found');
    return manager;
  }

  private mapManager(user: {
    id: string;
    employeeId: string;
    email: string | null;
    fullName: string;
    phone: string | null;
    role: string;
    hubId: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    hub: {
      id: string;
      code: string;
      name: string;
      city: string;
      state: string;
    };
  }) {
    return {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      employeeId: user.employeeId,
      email: user.email,
      mobile: user.phone,
      phone: user.phone,
      role: user.role,
      hubId: user.hubId,
      hubName: user.hub.name,
      hubCode: user.hub.code,
      city: user.hub.city,
      state: user.hub.state,
      status: user.isActive ? 'ACTIVE' : 'INACTIVE',
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async nextEmployeeId(): Promise<string> {
    const last = await this.prisma.hubUser.findFirst({
      where: { employeeId: { startsWith: 'hubmanager' } },
      orderBy: { employeeId: 'desc' },
      select: { employeeId: true },
    });

    let next = 1;
    if (last) {
      const match = last.employeeId.match(/hubmanager(\d+)/i);
      if (match) next = parseInt(match[1], 10) + 1;
    }

    const candidate = `hubmanager${String(next).padStart(2, '0')}`;
    const exists = await this.prisma.hubUser.findUnique({
      where: { employeeId: candidate },
    });
    if (exists) {
      throw new BadRequestException('Could not generate unique employee ID');
    }
    return candidate;
  }
}
