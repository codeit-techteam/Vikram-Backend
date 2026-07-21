import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuditAction } from '../../../generated/prisma/client';

interface AuditLogInput {
  adminUserId?: string;
  adminEmail?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminUserId: input.adminUserId ?? null,
          adminEmail: input.adminEmail ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          oldValue: input.oldValue ? JSON.parse(JSON.stringify(input.oldValue)) : undefined,
          newValue: input.newValue ? JSON.parse(JSON.stringify(input.newValue)) : undefined,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch {
      // Audit logging must never break the main flow
    }
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    adminUserId?: string;
    resource?: string;
    action?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.adminUserId) where['adminUserId'] = params.adminUserId;
    if (params.resource) where['resource'] = params.resource;
    if (params.action) where['action'] = params.action;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          adminUser: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
