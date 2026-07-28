import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  InventoryLedgerType,
  Prisma,
  RequisitionItemStatus,
  RequisitionStatus,
} from '../../../generated/prisma/client';
import {
  AllocateRequisitionDto,
  ApproveRequisitionDto,
  CreateRequisitionDto,
  DispatchRequisitionDto,
  ReceiveRequisitionDto,
  RejectRequisitionDto,
  RequisitionCommentDto,
  RequisitionPaginationQueryDto,
  UpdateRequisitionDto,
} from './dto/requisitions.dto';

const MAIN_WAREHOUSE = {
  id: 'wh-main-gurugram',
  code: 'WH-GURUGRAM',
  name: 'Main Warehouse Gurugram',
} as const;

const TIMELINE_STEPS = [
  'Submitted',
  'Warehouse Reviewed',
  'Approved',
  'Allocated',
  'Vehicle Assigned',
  'Dispatched',
  'In Transit',
  'Hub Received',
  'Completed',
] as const;

interface ActorContext {
  id: string;
  name: string;
  role: string;
}

function formatDisplayDate(value?: Date | string | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

@Injectable()
export class RequisitionsService {
  constructor(private readonly prisma: PrismaService) {}

  private requisitionInclude() {
    return {
      hub: { select: { id: true, code: true, name: true, city: true } },
      warehouseHub: { select: { id: true, code: true, name: true } },
      vehicle: { select: { id: true, registration: true, capacity: true } },
      driver: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              retailPrice: true,
              category: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      },
      timeline: { orderBy: { createdAt: 'asc' as const } },
      comments: { orderBy: { createdAt: 'desc' as const } },
      auditLogs: { orderBy: { createdAt: 'desc' as const }, take: 50 },
    } satisfies Prisma.RequisitionInclude;
  }

  private hubCodePrefix(code: string): string {
    const match = code.match(/HUB-([A-Z]+)/i);
    if (match?.[1]) return match[1].toUpperCase();
    return code.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'HUB';
  }

  async resolveWarehouseHub() {
    let warehouse = await this.prisma.hub.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { code: MAIN_WAREHOUSE.code },
          { hubType: 'CENTRAL_WAREHOUSE' },
          { warehouseCode: MAIN_WAREHOUSE.name },
        ],
      },
    });

    if (!warehouse) {
      warehouse = await this.prisma.hub.upsert({
        where: { code: MAIN_WAREHOUSE.code },
        update: {
          name: MAIN_WAREHOUSE.name,
          hubType: 'CENTRAL_WAREHOUSE',
          warehouseId: MAIN_WAREHOUSE.id,
          warehouseCode: MAIN_WAREHOUSE.name,
          isActive: true,
        },
        create: {
          code: MAIN_WAREHOUSE.code,
          name: MAIN_WAREHOUSE.name,
          addressLine1: 'Sector 18, Gurugram',
          city: 'Gurugram',
          state: 'Haryana',
          pincode: '122015',
          latitude: 28.4595,
          longitude: 77.0266,
          hubType: 'CENTRAL_WAREHOUSE',
          warehouseId: MAIN_WAREHOUSE.id,
          warehouseCode: MAIN_WAREHOUSE.name,
          isActive: true,
        },
      });
    }

    return warehouse;
  }

  private async nextRequestNo(hubCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = this.hubCodePrefix(hubCode);

    const counter = await this.prisma.requisitionNumberCounter.upsert({
      where: { hubCode_year: { hubCode: prefix, year } },
      update: { lastSeq: { increment: 1 } },
      create: { hubCode: prefix, year, lastSeq: 1 },
    });

    return `REQ-${prefix}-${year}-${String(counter.lastSeq).padStart(6, '0')}`;
  }

  private async getStockSnapshot(hubId: string, productId: string) {
    const row = await this.prisma.hubInventory.findUnique({
      where: { hubId_productId: { hubId, productId } },
    });
    return {
      available: row?.availableQty ?? 0,
      minimum: row?.minimumStock ?? row?.lowStockThreshold ?? 0,
    };
  }

  private computeTotals(
    items: { requestedQty: number; unitPrice: Prisma.Decimal | number }[],
  ) {
    const totalItems = items.length;
    const totalQty = items.reduce((sum, item) => sum + item.requestedQty, 0);
    const totalValue = items.reduce(
      (sum, item) =>
        sum + item.requestedQty * Number(item.unitPrice ?? 0),
      0,
    );
    return { totalItems, totalQty, totalValue };
  }

  private mapStatusForHubUi(status: RequisitionStatus): string {
    const map: Record<RequisitionStatus, string> = {
      DRAFT: 'pending',
      SUBMITTED: 'pending',
      PENDING_APPROVAL: 'pending',
      APPROVED: 'approved',
      REJECTED: 'pending',
      ALLOCATED: 'allocated',
      DISPATCHED: 'delivered',
      IN_TRANSIT: 'in_transit',
      RECEIVED: 'received',
      COMPLETED: 'received',
    };
    return map[status] ?? 'pending';
  }

  private mapListItem(row: Awaited<ReturnType<typeof this.findOneRaw>>) {
    const firstItem = row.items[0];
    const itemSummary =
      row.items.length === 1 && firstItem
        ? `${firstItem.requestedQty} ${firstItem.unit} (${firstItem.productName})`
        : `${row.totalItems} items`;

    return {
      id: row.id,
      requestId: row.requestNo,
      requestNo: row.requestNo,
      date: formatDisplayDate(row.submittedAt ?? row.createdAt),
      hubLocation: row.hub.name,
      hubId: row.hubId,
      hubName: row.hub.name,
      priority: row.priority.toLowerCase(),
      items: {
        quantity:
          row.items.length === 1 && firstItem
            ? `${firstItem.requestedQty} ${firstItem.unit}`
            : `${row.totalQty} total`,
        material:
          row.items.length === 1 && firstItem
            ? firstItem.productName
            : row.items.map((i) => i.productName).join(', '),
      },
      itemSummary,
      totalQty: row.totalQty,
      totalItems: row.totalItems,
      value: this.formatCurrency(Number(row.totalValue)),
      totalValue: Number(row.totalValue),
      status: this.mapStatusForHubUi(row.status),
      rawStatus: row.status,
      expectedDate: row.expectedDate,
      reason: row.reason,
      timeline: row.timeline.map((step) => ({
        id: step.id,
        title: step.title,
        subtitle: step.subtitle ?? undefined,
        timestamp: step.occurredAt
          ? step.occurredAt.toLocaleString('en-IN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        status: step.stepStatus as 'completed' | 'active' | 'pending',
      })),
    };
  }

  private formatCurrency(amount: number): string {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${Math.round(amount / 1000)}K`;
    return `₹${Math.round(amount)}`;
  }

  private mapAdminListItem(row: Awaited<ReturnType<typeof this.findOneRaw>>) {
    const first = row.items[0];
    return {
      id: row.id,
      requestId: row.requestNo,
      requestNo: row.requestNo,
      requestedBy: {
        name: row.requestedByName ?? row.requestedBy,
        role: 'HUB_MANAGER',
      },
      hubName: row.hub.name,
      hubId: row.hubId,
      warehouseId: row.warehouseId ?? MAIN_WAREHOUSE.id,
      warehouseName: row.warehouseHub?.name ?? MAIN_WAREHOUSE.name,
      materialId: first?.productId ?? '',
      material:
        row.items.length === 1 && first
          ? first.productName
          : `${row.totalItems} materials`,
      sku: first?.sku ?? undefined,
      requestedQty: row.totalQty,
      approvedQty: row.items.reduce(
        (sum, item) => sum + (item.approvedQty ?? 0),
        0,
      ),
      unit: first?.unit ?? 'Units',
      priority: this.mapAdminPriority(row.priority),
      status: this.mapAdminStatus(row.status),
      rawStatus: row.status,
      requestDate: row.submittedAt ?? row.createdAt,
      expectedDate: row.expectedDate,
      estimatedValue: Number(row.totalValue),
      allocationStatus:
        row.status === 'ALLOCATED' ||
        row.status === 'DISPATCHED' ||
        row.status === 'IN_TRANSIT' ||
        row.status === 'RECEIVED' ||
        row.status === 'COMPLETED'
          ? 'ALLOCATED'
          : 'PENDING',
    };
  }

  private mapAdminPriority(priority: string) {
    if (priority === 'URGENT') return 'critical';
    if (priority === 'HIGH') return 'high';
    return 'medium';
  }

  private mapAdminStatus(status: RequisitionStatus) {
    if (status === 'PENDING_APPROVAL' || status === 'SUBMITTED') return 'PENDING';
    if (status === 'IN_TRANSIT') return 'TRANSFERRED';
    if (status === 'REJECTED') return 'REJECTED';
    if (status === 'COMPLETED' || status === 'RECEIVED') return 'COMPLETED';
    return status as 'APPROVED' | 'ALLOCATED' | 'PENDING' | 'REJECTED' | 'COMPLETED' | 'TRANSFERRED';
  }

  private async findOneRaw(id: string, hubId?: string) {
    const row = await this.prisma.requisition.findFirst({
      where: {
        id,
        ...(hubId ? { hubId } : {}),
      },
      include: this.requisitionInclude(),
    });
    if (!row) throw new NotFoundException('Requisition not found');
    return row;
  }

  private async writeAudit(
    requisitionId: string,
    actor: ActorContext,
    action: string,
    previousValue?: unknown,
    newValue?: unknown,
  ) {
    await this.prisma.requisitionAuditLog.create({
      data: {
        requisitionId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        previousValue: previousValue
          ? JSON.parse(JSON.stringify(previousValue))
          : undefined,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
      },
    });
  }

  private async writeTimeline(
    requisitionId: string,
    title: string,
    subtitle: string | null,
    stepStatus: 'completed' | 'active' | 'pending',
    occurredAt?: Date,
  ) {
    await this.prisma.requisitionTimeline.create({
      data: {
        requisitionId,
        title,
        subtitle,
        stepStatus,
        occurredAt: occurredAt ?? (stepStatus === 'completed' ? new Date() : null),
      },
    });
  }

  private async seedTimeline(requisitionId: string) {
    for (const title of TIMELINE_STEPS) {
      await this.writeTimeline(requisitionId, title, null, 'pending');
    }
  }

  private async activateTimelineStep(
    requisitionId: string,
    title: string,
    subtitle?: string,
  ) {
    const steps = await this.prisma.requisitionTimeline.findMany({
      where: { requisitionId },
      orderBy: { createdAt: 'asc' },
    });

    for (const step of steps) {
      if (step.title === title) {
        await this.prisma.requisitionTimeline.update({
          where: { id: step.id },
          data: {
            stepStatus: 'completed',
            subtitle: subtitle ?? step.subtitle,
            occurredAt: new Date(),
          },
        });
        break;
      }
      if (step.stepStatus !== 'completed') {
        await this.prisma.requisitionTimeline.update({
          where: { id: step.id },
          data: { stepStatus: 'completed', occurredAt: new Date() },
        });
      }
    }
  }

  private async notifyHub(
    hubId: string,
    title: string,
    body: string,
    actionRoute?: string,
  ) {
    await this.prisma.hubNotification.create({
      data: {
        hubId,
        type: 'REQUISITION',
        title,
        body,
        actionRoute,
      },
    });
  }

  private async writeLedger(params: {
    hubId: string;
    productId: string;
    requisitionId: string;
    type: InventoryLedgerType;
    quantity: number;
    referenceNo: string;
    remarks?: string;
    createdBy?: string;
  }) {
    const inventory = await this.prisma.hubInventory.findUnique({
      where: {
        hubId_productId: { hubId: params.hubId, productId: params.productId },
      },
    });
    const openingQty = inventory?.availableQty ?? 0;
    const closingQty = openingQty + params.quantity;

    await this.prisma.inventoryLedgerEntry.create({
      data: {
        hubId: params.hubId,
        productId: params.productId,
        requisitionId: params.requisitionId,
        type: params.type,
        quantity: params.quantity,
        openingQty,
        closingQty,
        referenceNo: params.referenceNo,
        remarks: params.remarks,
        createdBy: params.createdBy,
      },
    });
  }

  async create(hubId: string, actor: ActorContext, dto: CreateRequisitionDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one material is required');
    }

    const hub = await this.prisma.hub.findUnique({ where: { id: hubId } });
    if (!hub) throw new NotFoundException('Hub not found');

    const warehouseHub = await this.resolveWarehouseHub();
    const requestNo = await this.nextRequestNo(hub.code);

    const itemRows = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        const hubStock = await this.getStockSnapshot(hubId, item.productId);
        const warehouseStock = await this.getStockSnapshot(
          warehouseHub.id,
          item.productId,
        );

        return {
          productId: item.productId,
          sku: product.sku,
          productName: product.name,
          requestedQty: item.requestedQty,
          availableStock: hubStock.available,
          minimumStock: hubStock.minimum,
          warehouseStock: warehouseStock.available,
          unit: product.unit,
          unitPrice: product.retailPrice,
          remarks: item.remarks,
          status: 'PENDING' as RequisitionItemStatus,
        };
      }),
    );

    const totals = this.computeTotals(itemRows);

    const requisition = await this.prisma.requisition.create({
      data: {
        requestNo,
        hubId,
        warehouseId: MAIN_WAREHOUSE.id,
        warehouseHubId: warehouseHub.id,
        priority: dto.priority,
        status: dto.submit ? 'PENDING_APPROVAL' : 'DRAFT',
        reason: dto.reason,
        expectedDate: new Date(dto.expectedDate),
        remarks: dto.remarks,
        requestedBy: actor.id,
        requestedByName: actor.name,
        submittedAt: dto.submit ? new Date() : null,
        totalItems: totals.totalItems,
        totalQty: totals.totalQty,
        totalValue: totals.totalValue,
        items: { create: itemRows },
      },
      include: this.requisitionInclude(),
    });

    await this.seedTimeline(requisition.id);

    if (dto.submit) {
      await this.activateTimelineStep(
        requisition.id,
        'Submitted',
        `${actor.name} submitted requisition`,
      );
      await this.writeAudit(requisition.id, actor, 'SUBMIT', null, {
        status: 'PENDING_APPROVAL',
      });
    }

    return this.mapDetail(requisition);
  }

  async update(
    id: string,
    hubId: string,
    actor: ActorContext,
    dto: UpdateRequisitionDto,
  ) {
    const existing = await this.findOneRaw(id, hubId);
    if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'].includes(existing.status)) {
      throw new BadRequestException('Requisition cannot be edited in current status');
    }

    let itemRows: Prisma.RequisitionItemCreateManyRequisitionInput[] | undefined;
    if (dto.items) {
      const warehouseHub = await this.resolveWarehouseHub();
      itemRows = await Promise.all(
        dto.items.map(async (item) => {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
          });
          if (!product) {
            throw new BadRequestException(`Product ${item.productId} not found`);
          }
          const hubStock = await this.getStockSnapshot(hubId, item.productId);
          const warehouseStock = await this.getStockSnapshot(
            warehouseHub.id,
            item.productId,
          );
          return {
            productId: item.productId,
            sku: product.sku,
            productName: product.name,
            requestedQty: item.requestedQty,
            availableStock: hubStock.available,
            minimumStock: hubStock.minimum,
            warehouseStock: warehouseStock.available,
            unit: product.unit,
            unitPrice: product.retailPrice,
            remarks: item.remarks,
            status: 'PENDING' as RequisitionItemStatus,
          };
        }),
      );
    }

    const totals = itemRows ? this.computeTotals(itemRows) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (itemRows) {
        await tx.requisitionItem.deleteMany({ where: { requisitionId: id } });
        await tx.requisitionItem.createMany({
          data: itemRows.map((row) => ({ ...row, requisitionId: id })),
        });
      }

      return tx.requisition.update({
        where: { id },
        data: {
          ...(dto.priority && { priority: dto.priority }),
          ...(dto.reason && { reason: dto.reason }),
          ...(dto.expectedDate && { expectedDate: new Date(dto.expectedDate) }),
          ...(dto.remarks !== undefined && { remarks: dto.remarks }),
          ...(totals && {
            totalItems: totals.totalItems,
            totalQty: totals.totalQty,
            totalValue: totals.totalValue,
          }),
        },
        include: this.requisitionInclude(),
      });
    });

    await this.writeAudit(existing.id, actor, 'UPDATE', existing.status, updated.status);
    return this.mapDetail(updated);
  }

  async submit(id: string, hubId: string, actor: ActorContext) {
    const existing = await this.findOneRaw(id, hubId);
    if (!['DRAFT', 'SUBMITTED'].includes(existing.status)) {
      throw new BadRequestException('Requisition already submitted');
    }
    if (!existing.items.length) {
      throw new BadRequestException('Add at least one material before submitting');
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        status: 'PENDING_APPROVAL',
        submittedAt: new Date(),
      },
      include: this.requisitionInclude(),
    });

    await this.activateTimelineStep(
      id,
      'Submitted',
      `${actor.name} submitted requisition`,
    );
    await this.writeAudit(id, actor, 'SUBMIT', existing.status, 'PENDING_APPROVAL');

    return this.mapDetail(updated);
  }

  async findAll(
    query: RequisitionPaginationQueryDto,
    hubId?: string,
    view: 'hub' | 'admin' = 'hub',
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RequisitionWhereInput = {
      ...(hubId ? { hubId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { requestNo: { contains: query.search, mode: 'insensitive' } },
              { hub: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                items: {
                  some: {
                    OR: [
                      { productName: { contains: query.search, mode: 'insensitive' } },
                      { sku: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.RequisitionOrderByWithRelationInput = {};
    const sortField = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    if (sortField === 'expectedDate') orderBy.expectedDate = sortOrder;
    else if (sortField === 'totalValue') orderBy.totalValue = sortOrder;
    else if (sortField === 'requestNo') orderBy.requestNo = sortOrder;
    else orderBy.createdAt = sortOrder;

    const [rows, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: this.requisitionInclude(),
      }),
      this.prisma.requisition.count({ where }),
    ]);

    const mapper = view === 'admin' ? this.mapAdminListItem.bind(this) : this.mapListItem.bind(this);

    return {
      data: rows.map((row) => mapper(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, hubId?: string) {
    const row = await this.findOneRaw(id, hubId);
    return this.mapDetail(row);
  }

  async getStats(hubId?: string) {
    const baseWhere: Prisma.RequisitionWhereInput = hubId ? { hubId } : {};

    const [openRequests, approvedRequests, delayedRequests, pendingApproval] =
      await Promise.all([
        this.prisma.requisition.count({
          where: {
            ...baseWhere,
            status: {
              in: ['SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'ALLOCATED', 'DISPATCHED', 'IN_TRANSIT'],
            },
          },
        }),
        this.prisma.requisition.count({
          where: { ...baseWhere, status: 'APPROVED' },
        }),
        this.prisma.requisition.count({
          where: {
            ...baseWhere,
            status: { in: ['PENDING_APPROVAL', 'IN_TRANSIT'] },
            expectedDate: { lt: new Date() },
          },
        }),
        this.prisma.requisition.count({
          where: { ...baseWhere, status: 'PENDING_APPROVAL' },
        }),
      ]);

    return {
      openRequests: { value: openRequests, badge: openRequests > 0 ? `+${openRequests} active` : 'None' },
      approvedRequests: { value: approvedRequests, badge: 'Stable' },
      delayedRequests: { value: delayedRequests, badge: delayedRequests > 0 ? 'Critical' : 'On track' },
      pendingApproval,
      pendingRequests: pendingApproval,
      criticalRequests: delayedRequests,
      awaitingAllocation: await this.prisma.requisition.count({
        where: { ...baseWhere, status: 'APPROVED' },
      }),
      inTransit: await this.prisma.requisition.count({
        where: { ...baseWhere, status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
      }),
      completed: await this.prisma.requisition.count({
        where: { ...baseWhere, status: { in: ['RECEIVED', 'COMPLETED'] } },
      }),
      rejected: await this.prisma.requisition.count({
        where: { ...baseWhere, status: 'REJECTED' },
      }),
    };
  }

  async approve(id: string, actor: ActorContext, dto: ApproveRequisitionDto) {
    const existing = await this.findOneRaw(id);
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only pending requisitions can be approved');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) continue;
        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: {
            approvedQty: item.approvedQty,
            status: item.approvedQty > 0 ? 'APPROVED' : 'REJECTED',
          },
        });
      }

      return tx.requisition.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: actor.id,
          approvedByName: actor.name,
          approvedAt: new Date(),
        },
        include: this.requisitionInclude(),
      });
    });

    await this.activateTimelineStep(id, 'Warehouse Reviewed');
    await this.activateTimelineStep(id, 'Approved', actor.name);
    await this.writeAudit(id, actor, 'APPROVE', existing.status, 'APPROVED');
    if (dto.comment) {
      await this.addComment(id, actor, { message: dto.comment });
    }
    await this.notifyHub(
      existing.hubId,
      'Requisition Approved',
      `${existing.requestNo} has been approved by warehouse.`,
      `/requisitions/${existing.id}`,
    );

    return this.mapDetail(updated);
  }

  async reject(id: string, actor: ActorContext, dto: RejectRequisitionDto) {
    const existing = await this.findOneRaw(id);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(existing.status)) {
      throw new BadRequestException('Requisition cannot be rejected in current status');
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedBy: actor.id,
        rejectedByName: actor.name,
        rejectionReason: dto.reason,
      },
      include: this.requisitionInclude(),
    });

    await this.activateTimelineStep(id, 'Warehouse Reviewed', dto.reason);
    await this.writeAudit(id, actor, 'REJECT', existing.status, 'REJECTED');
    if (dto.comment) {
      await this.addComment(id, actor, { message: dto.comment });
    }
    await this.notifyHub(
      existing.hubId,
      'Requisition Rejected',
      `${existing.requestNo} was rejected: ${dto.reason}`,
      `/requisitions/${existing.id}`,
    );

    return this.mapDetail(updated);
  }

  async allocate(id: string, actor: ActorContext, dto: AllocateRequisitionDto) {
    const existing = await this.findOneRaw(id);
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Only approved requisitions can be allocated');
    }

    const warehouseHub = await this.resolveWarehouseHub();

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) continue;

        const inventory = await tx.hubInventory.findUnique({
          where: {
            hubId_productId: {
              hubId: warehouseHub.id,
              productId: row.productId,
            },
          },
        });

        const available = inventory?.availableQty ?? 0;
        if (available < item.allocatedQty) {
          throw new BadRequestException(
            `Insufficient warehouse stock for ${row.productName}`,
          );
        }

        if (inventory) {
          await tx.hubInventory.update({
            where: { id: inventory.id },
            data: {
              availableQty: { decrement: item.allocatedQty },
              reservedQty: { increment: item.allocatedQty },
            },
          });
        }

        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: {
            allocatedQty: item.allocatedQty,
            status: 'ALLOCATED',
          },
        });

        await this.writeLedger({
          hubId: warehouseHub.id,
          productId: row.productId,
          requisitionId: id,
          type: 'REQUISITION_ALLOCATE',
          quantity: -item.allocatedQty,
          referenceNo: existing.requestNo,
          remarks: `Allocated to ${existing.hub.name}`,
          createdBy: actor.name,
        });
      }

      return tx.requisition.update({
        where: { id },
        data: {
          status: 'ALLOCATED',
          allocatedBy: actor.id,
          allocatedByName: actor.name,
          allocatedAt: new Date(),
          warehouseBin: dto.warehouseBin,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          expectedDispatchDate: dto.expectedDispatchDate
            ? new Date(dto.expectedDispatchDate)
            : undefined,
        },
        include: this.requisitionInclude(),
      });
    });

    await this.activateTimelineStep(id, 'Allocated', actor.name);
    if (dto.vehicleId) {
      await this.activateTimelineStep(id, 'Vehicle Assigned');
    }
    await this.writeAudit(id, actor, 'ALLOCATE', existing.status, 'ALLOCATED');

    return this.mapDetail(updated);
  }

  async dispatch(id: string, actor: ActorContext, dto: DispatchRequisitionDto) {
    const existing = await this.findOneRaw(id);
    if (existing.status !== 'ALLOCATED') {
      throw new BadRequestException('Only allocated requisitions can be dispatched');
    }

    const warehouseHub = await this.resolveWarehouseHub();
    let vehicleRegistration = existing.vehicleRegistration;
    let driverName = existing.driverName;

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      vehicleRegistration = vehicle?.registration ?? vehicleRegistration;
    }
    if (dto.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: dto.driverId },
      });
      driverName = driver?.name ?? driverName;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        const qty = item.allocatedQty ?? item.approvedQty ?? item.requestedQty;
        if (!qty) continue;

        const inventory = await tx.hubInventory.findUnique({
          where: {
            hubId_productId: {
              hubId: warehouseHub.id,
              productId: item.productId,
            },
          },
        });

        if (inventory) {
          await tx.hubInventory.update({
            where: { id: inventory.id },
            data: { reservedQty: { decrement: qty } },
          });
        }

        await tx.requisitionItem.update({
          where: { id: item.id },
          data: { status: 'DISPATCHED' },
        });

        await this.writeLedger({
          hubId: warehouseHub.id,
          productId: item.productId,
          requisitionId: id,
          type: 'REQUISITION_DISPATCH',
          quantity: -qty,
          referenceNo: existing.requestNo,
          remarks: `Dispatched to ${existing.hub.name}`,
          createdBy: actor.name,
        });
      }

      return tx.requisition.update({
        where: { id },
        data: {
          status: 'IN_TRANSIT',
          dispatchedAt: dto.dispatchDate ? new Date(dto.dispatchDate) : new Date(),
          vehicleId: dto.vehicleId ?? existing.vehicleId,
          driverId: dto.driverId ?? existing.driverId,
          vehicleRegistration,
          driverName,
          lrNumber: dto.lrNumber,
          estimatedArrival: dto.estimatedArrival
            ? new Date(dto.estimatedArrival)
            : undefined,
        },
        include: this.requisitionInclude(),
      });
    });

    await this.activateTimelineStep(id, 'Dispatched', dto.lrNumber ?? undefined);
    await this.activateTimelineStep(id, 'In Transit');
    await this.writeAudit(id, actor, 'DISPATCH', existing.status, 'IN_TRANSIT');
    await this.notifyHub(
      existing.hubId,
      'Requisition Dispatched',
      `${existing.requestNo} is in transit.${dto.lrNumber ? ` LR: ${dto.lrNumber}` : ''}`,
      `/requisitions/${existing.id}`,
    );

    return this.mapDetail(updated);
  }

  async receive(
    id: string,
    hubId: string,
    actor: ActorContext,
    dto: ReceiveRequisitionDto,
  ) {
    const existing = await this.findOneRaw(id, hubId);
    if (!['IN_TRANSIT', 'DISPATCHED', 'ALLOCATED'].includes(existing.status)) {
      throw new BadRequestException('Requisition is not ready for receiving');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) continue;

        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: {
            receivedQty: item.receivedQty,
            shortageQty: item.shortageQty,
            damageQty: item.damageQty,
            missingQty: item.missingQty,
            remarks: item.remarks,
            status: 'RECEIVED',
          },
        });

        if (item.receivedQty > 0) {
          await tx.hubInventory.upsert({
            where: {
              hubId_productId: { hubId, productId: row.productId },
            },
            update: { availableQty: { increment: item.receivedQty } },
            create: {
              hubId,
              productId: row.productId,
              availableQty: item.receivedQty,
              reservedQty: 0,
            },
          });

          await this.writeLedger({
            hubId,
            productId: row.productId,
            requisitionId: id,
            type: 'REQUISITION_RECEIVE',
            quantity: item.receivedQty,
            referenceNo: existing.requestNo,
            remarks: item.remarks ?? 'Requisition received',
            createdBy: actor.name,
          });
        }
      }

      return tx.requisition.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          receivedBy: actor.id,
          receivedByName: actor.name,
          receivedAt: new Date(),
          completedAt: new Date(),
        },
        include: this.requisitionInclude(),
      });
    });

    await this.activateTimelineStep(id, 'Hub Received', actor.name);
    await this.activateTimelineStep(id, 'Completed');
    await this.writeAudit(id, actor, 'RECEIVE', existing.status, 'COMPLETED');
    if (dto.comment) {
      await this.addComment(id, actor, { message: dto.comment });
    }

    return this.mapDetail(updated);
  }

  async addComment(id: string, actor: ActorContext, dto: RequisitionCommentDto) {
    await this.findOneRaw(id);
    const comment = await this.prisma.requisitionComment.create({
      data: {
        requisitionId: id,
        authorId: actor.id,
        authorName: actor.name,
        authorRole: actor.role,
        message: dto.message,
      },
    });
    return comment;
  }

  async searchMaterials(hubId: string, search?: string) {
    const warehouseHub = await this.resolveWarehouseHub();
    const where: Prisma.HubInventoryWhereInput = {
      hubId,
      ...(search
        ? {
            product: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const rows = await this.prisma.hubInventory.findMany({
      where,
      take: 50,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            retailPrice: true,
            category: { select: { id: true, slug: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return Promise.all(
      rows.map(async (row) => {
        const warehouseStock = await this.getStockSnapshot(
          warehouseHub.id,
          row.productId,
        );
        return {
          productId: row.productId,
          inventoryId: row.id,
          sku: row.product.sku,
          name: row.product.name,
          category: row.product.category?.name ?? 'Uncategorized',
          categorySlug: row.product.category?.slug,
          currentStock: row.availableQty,
          minimumStock: row.minimumStock || row.lowStockThreshold,
          warehouseStock: warehouseStock.available,
          unit: row.product.unit,
          unitPrice: Number(row.product.retailPrice),
          lowStock: row.availableQty <= (row.minimumStock || row.lowStockThreshold),
        };
      }),
    );
  }

  private mapDetail(row: Awaited<ReturnType<typeof this.findOneRaw>>) {
    return {
      ...this.mapListItem(row),
      remarks: row.remarks,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseHub?.name ?? MAIN_WAREHOUSE.name,
      warehouseHubId: row.warehouseHubId,
      rejectionReason: row.rejectionReason,
      approval: {
        approvedBy: row.approvedByName,
        approvedAt: row.approvedAt,
      },
      allocation: {
        allocatedBy: row.allocatedByName,
        allocatedAt: row.allocatedAt,
        warehouseBin: row.warehouseBin,
        expectedDispatchDate: row.expectedDispatchDate,
      },
      dispatch: {
        vehicleRegistration: row.vehicleRegistration,
        driverName: row.driverName,
        lrNumber: row.lrNumber,
        dispatchedAt: row.dispatchedAt,
        estimatedArrival: row.estimatedArrival,
      },
      receiving: {
        receivedBy: row.receivedByName,
        receivedAt: row.receivedAt,
        completedAt: row.completedAt,
      },
      materials: row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty,
        allocatedQty: item.allocatedQty,
        receivedQty: item.receivedQty,
        availableStock: item.availableStock,
        minimumStock: item.minimumStock,
        warehouseStock: item.warehouseStock,
        unit: item.unit,
        unitPrice: Number(item.unitPrice),
        remarks: item.remarks,
        status: item.status,
        shortageQty: item.shortageQty,
        damageQty: item.damageQty,
        missingQty: item.missingQty,
        category: item.product.category?.name,
      })),
      comments: row.comments,
      auditLogs: row.auditLogs,
      activityLogs: row.auditLogs.map((log) => ({
        id: log.id,
        who: log.actorName,
        action: log.action,
        role: log.actorRole,
        at: log.createdAt,
        previousValue: log.previousValue,
        newValue: log.newValue,
      })),
    };
  }
}
