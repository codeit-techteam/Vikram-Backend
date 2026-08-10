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
      vehicle: { select: { id: true, registration: true, capacity: true, vehicleType: true } },
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
        OR: [{ id }, { requestNo: id }],
        ...(hubId ? { hubId } : {}),
      },
      include: this.requisitionInclude(),
    });
    if (!row) throw new NotFoundException('Requisition not found');
    return row;
  }

  /** Incoming CW→hub shipments surfaced as Hub Panel "Transfers". */
  async listIncomingTransfers(hubId: string) {
    const rows = await this.prisma.requisition.findMany({
      where: {
        hubId,
        status: {
          in: [
            'ALLOCATED',
            'DISPATCHED',
            'IN_TRANSIT',
            'RECEIVED',
            'COMPLETED',
          ],
        },
      },
      orderBy: [{ estimatedArrival: 'asc' }, { dispatchedAt: 'desc' }],
      include: this.requisitionInclude(),
    });

    const transfers = rows.map((row) => this.mapIncomingTransfer(row));
    const active = transfers.filter((t) => t.status !== 'received');
    const delayed = active.filter((t) => t.isDelayed).length;
    const onTime = active.length - delayed;

    return {
      summary: {
        totalIncoming: active.length,
        onTime,
        delayed,
      },
      transfers,
    };
  }

  async getIncomingTransfer(hubId: string, idOrRequestNo: string) {
    const row = await this.findOneRaw(idOrRequestNo, hubId);
    if (
      ![
        'ALLOCATED',
        'DISPATCHED',
        'IN_TRANSIT',
        'RECEIVED',
        'COMPLETED',
      ].includes(row.status)
    ) {
      throw new NotFoundException('Incoming transfer not found');
    }
    return this.mapIncomingTransfer(row);
  }

  private mapIncomingTransfer(
    row: Awaited<ReturnType<typeof this.findOneRaw>>,
  ) {
    const now = new Date();
    const eta = row.estimatedArrival;
    const isToday =
      !!eta &&
      eta.getFullYear() === now.getFullYear() &&
      eta.getMonth() === now.getMonth() &&
      eta.getDate() === now.getDate();
    const isDelayed =
      !!eta &&
      eta.getTime() < now.getTime() &&
      ['DISPATCHED', 'IN_TRANSIT', 'ALLOCATED'].includes(row.status);

    let status:
      | 'ready'
      | 'in_transit'
      | 'arriving_today'
      | 'delayed'
      | 'received'
      | 'dispatched' = 'in_transit';

    if (row.status === 'ALLOCATED') status = 'ready';
    else if (row.status === 'DISPATCHED') status = 'dispatched';
    else if (row.status === 'COMPLETED' || row.status === 'RECEIVED')
      status = 'received';
    else if (isDelayed) status = 'delayed';
    else if (isToday) status = 'arriving_today';
    else status = 'in_transit';

    const etaDisplay = (() => {
      if (status === 'received') return 'Received';
      if (status === 'ready') {
        return row.expectedDispatchDate
          ? `Ready · Dispatch ${formatDisplayDate(row.expectedDispatchDate)}`
          : 'Ready for dispatch';
      }
      if (!eta) return row.dispatchedAt ? 'In transit' : 'ETA pending';
      if (isDelayed) {
        return `${eta.toLocaleString('en-IN', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })} (Delayed)`;
      }
      if (isToday) {
        return `Today, ${eta.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }
      const hours = Math.max(
        0,
        Math.round((eta.getTime() - now.getTime()) / 36e5),
      );
      if (hours > 0 && hours < 48) return `ETA in ${hours} Hours`;
      return eta.toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    })();

    const driverPhone = row.driver?.phone ?? '';

    return {
      id: row.id,
      transferId: row.requestNo,
      status,
      eta: eta?.toISOString() ?? null,
      scheduled: row.expectedDispatchDate?.toISOString() ?? null,
      etaDisplay,
      isDelayed,
      source: row.warehouseHub?.name ?? MAIN_WAREHOUSE.name,
      destination: row.hub.name,
      dispatchDate: row.dispatchedAt?.toISOString(),
      vehicle: row.vehicleRegistration ?? row.vehicle?.registration ?? 'TBD',
      vehicleDetails: {
        number: row.vehicleRegistration ?? row.vehicle?.registration ?? 'TBD',
        type: row.vehicle?.vehicleType
          ? String(row.vehicle.vehicleType)
          : 'Material Carrier',
        capacity: row.vehicle?.capacity
          ? `${Number(row.vehicle.capacity)} Tons`
          : '—',
        status:
          status === 'in_transit' || status === 'dispatched' || status === 'delayed'
            ? 'On Route'
            : status === 'received'
              ? 'Delivered'
              : 'Standby',
      },
      driver: {
        name: row.driverName ?? row.driver?.name ?? 'TBD',
        phone: driverPhone,
      },
      materials: row.items.map((item) => {
        const qty =
          item.allocatedQty ?? item.approvedQty ?? item.requestedQty;
        return {
          id: item.id,
          name: item.productName,
          quantity: `${qty} ${item.unit}`,
          sku: item.sku ?? undefined,
          productId: item.productId,
          itemId: item.id,
          requestedQty: item.requestedQty,
          approvedQty: item.approvedQty,
          allocatedQty: item.allocatedQty,
          receivedQty: item.receivedQty,
          unit: item.unit,
        };
      }),
      manifest: row.items.map((item) => {
        const qty =
          item.allocatedQty ?? item.approvedQty ?? item.requestedQty;
        return {
          id: item.id,
          name: item.productName,
          quantity: qty,
          unit: item.unit,
          status:
            row.status === 'COMPLETED' || row.status === 'RECEIVED'
              ? ('delivered' as const)
              : row.status === 'ALLOCATED'
                ? ('pending' as const)
                : ('in_transit' as const),
          sku: item.sku ?? undefined,
        };
      }),
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
      shipmentTimeline: row.timeline.map((step) => ({
        id: step.id,
        title: step.title,
        timestamp: step.occurredAt
          ? step.occurredAt.toLocaleString('en-IN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined,
        status: step.stepStatus as 'completed' | 'active' | 'pending',
        highlight:
          step.stepStatus === 'active' ? etaDisplay : undefined,
      })),
      documents: this.mergeTransferDocuments(row),
      photos: this.parseReceivingPhotos(row.receivingPhotos),
      receivingDocuments: this.parseReceivingDocuments(row.receivingDocuments),
      requisitionId: row.id,
      dispatchId: row.lrNumber ?? row.id,
      createdAt: (
        row.dispatchedAt ??
        row.allocatedAt ??
        row.createdAt
      ).toISOString(),
      rawStatus: row.status,
      priority: row.priority,
      lrNumber: row.lrNumber,
      receivedBy: row.receivedByName ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
    };
  }

  private parseReceivingPhotos(value: unknown): Array<{
    id: string;
    url: string;
    name?: string;
    size?: string;
    uploadedAt?: string;
  }> {
    if (!Array.isArray(value)) return [];
    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const url = typeof row.url === 'string' ? row.url : null;
        if (!url) return null;
        return {
          id: typeof row.id === 'string' ? row.id : `photo-${index}`,
          url,
          name: typeof row.name === 'string' ? row.name : undefined,
          size: typeof row.size === 'string' ? row.size : undefined,
          uploadedAt:
            typeof row.uploadedAt === 'string' ? row.uploadedAt : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private parseReceivingDocuments(value: unknown): Array<{
    id: string;
    url: string;
    name: string;
    type: string;
    size: string;
    uploadedAt?: string;
  }> {
    if (!Array.isArray(value)) return [];
    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const url = typeof row.url === 'string' ? row.url : null;
        if (!url) return null;
        return {
          id: typeof row.id === 'string' ? row.id : `doc-${index}`,
          url,
          name:
            typeof row.name === 'string' ? row.name : `Document ${index + 1}`,
          type: typeof row.type === 'string' ? row.type : 'OTHER',
          size: typeof row.size === 'string' ? row.size : '—',
          uploadedAt:
            typeof row.uploadedAt === 'string' ? row.uploadedAt : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  }

  private mergeTransferDocuments(
    row: Awaited<ReturnType<typeof this.findOneRaw>>,
  ) {
    const docs: Array<{
      id: string;
      name: string;
      type: string;
      size: string;
      url?: string;
    }> = [];
    if (row.lrNumber) {
      docs.push({
        id: `lr-${row.id}`,
        name: `LR ${row.lrNumber}`,
        type: 'LR',
        size: '—',
      });
    }
    for (const doc of this.parseReceivingDocuments(row.receivingDocuments)) {
      docs.push({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: doc.size,
        url: doc.url,
      });
    }
    return docs;
  }

  async listHubReceiving(params?: { search?: string; status?: string }) {
    const rows = await this.prisma.requisition.findMany({
      where: {
        status: {
          in: [
            'DISPATCHED',
            'IN_TRANSIT',
            'RECEIVED',
            'COMPLETED',
          ],
        },
      },
      orderBy: [
        { receivedAt: 'desc' },
        { estimatedArrival: 'asc' },
        { dispatchedAt: 'desc' },
      ],
      include: this.requisitionInclude(),
    });

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    let items = rows.map((row) => this.mapHubReceivingItem(row));

    if (params?.search?.trim()) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.transferId.toLowerCase().includes(q) ||
          item.hubName.toLowerCase().includes(q) ||
          item.vehicle.toLowerCase().includes(q) ||
          item.driverName.toLowerCase().includes(q),
      );
    }

    if (params?.status && params.status !== 'all') {
      items = items.filter((item) => item.queueStatus === params.status);
    }

    const awaitingReceipt = items.filter(
      (i) => i.queueStatus === 'awaiting_receipt',
    ).length;
    const receivedToday = items.filter(
      (i) =>
        i.queueStatus === 'received' &&
        i.receivedAt &&
        new Date(i.receivedAt) >= startOfDay,
    ).length;
    const completed = items.filter((i) => i.queueStatus === 'received').length;
    const pendingVerification = awaitingReceipt;

    return {
      summary: {
        awaitingReceipt,
        receivedToday,
        pendingVerification,
        completed,
        rejected: 0,
      },
      items,
    };
  }

  async getHubReceivingDetail(idOrRequestNo: string) {
    const row = await this.findOneRaw(idOrRequestNo);
    if (
      !['DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'].includes(
        row.status,
      )
    ) {
      throw new NotFoundException('Hub receiving record not found');
    }
    return this.mapHubReceivingItem(row, true);
  }

  private mapHubReceivingItem(
    row: Awaited<ReturnType<typeof this.findOneRaw>>,
    detailed = false,
  ) {
    const isReceived =
      row.status === 'COMPLETED' || row.status === 'RECEIVED';
    const photos = this.parseReceivingPhotos(row.receivingPhotos);
    const documents = this.parseReceivingDocuments(row.receivingDocuments);
    const materials = row.items.map((item) => {
      const dispatched =
        item.allocatedQty ?? item.approvedQty ?? item.requestedQty;
      const received = item.receivedQty ?? (isReceived ? dispatched : null);
      const difference =
        received == null ? null : Number(received) - Number(dispatched);
      return {
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unit: item.unit,
        dispatchedQty: Number(dispatched),
        receivedQty: received == null ? null : Number(received),
        difference,
        shortageQty: item.shortageQty ?? 0,
        damageQty: item.damageQty ?? 0,
        missingQty: item.missingQty ?? 0,
        remarks: item.remarks,
        status: isReceived
          ? difference === 0
            ? 'MATCHED'
            : difference != null && difference < 0
              ? 'SHORTAGE'
              : 'RECEIVED'
          : 'IN_TRANSIT',
      };
    });

    const base = {
      id: row.id,
      transferId: row.requestNo,
      requisitionId: row.id,
      dispatchId: row.lrNumber ?? row.id,
      hubId: row.hubId,
      hubName: row.hub.name,
      warehouseName: row.warehouseHub?.name ?? MAIN_WAREHOUSE.name,
      vehicle: row.vehicleRegistration ?? row.vehicle?.registration ?? 'TBD',
      driverName: row.driverName ?? row.driver?.name ?? 'TBD',
      driverPhone: row.driver?.phone ?? null,
      eta: row.estimatedArrival?.toISOString() ?? null,
      dispatchDate: row.dispatchedAt?.toISOString() ?? null,
      arrivedAt: row.estimatedArrival?.toISOString() ?? null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      receivedBy: row.receivedByName ?? null,
      rawStatus: row.status,
      queueStatus: isReceived ? ('received' as const) : ('awaiting_receipt' as const),
      priority: row.priority,
      materialSummary: materials
        .map((m) => `${m.productName} x ${m.dispatchedQty}`)
        .join(', '),
      quantitySummary: `${materials.reduce((sum, m) => sum + m.dispatchedQty, 0)} units`,
      hasProof: photos.length > 0 || documents.length > 0,
      photoCount: photos.length,
      documentCount: documents.length,
      materials,
      photos,
      documents,
    };

    if (!detailed) return base;

    return {
      ...base,
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
      activityLogs: row.auditLogs?.map((log) => ({
        id: log.id,
        who: log.actorName,
        action: log.action,
        role: log.actorRole,
        at: log.createdAt.toISOString(),
      })),
    };
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

  private async writeLedger(
    params: {
      hubId: string;
      productId: string;
      requisitionId: string;
      type: InventoryLedgerType;
      quantity: number;
      referenceNo: string;
      remarks?: string;
      createdBy?: string;
      openingQty?: number;
      closingQty?: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    let openingQty = params.openingQty;
    let closingQty = params.closingQty;

    if (openingQty === undefined || closingQty === undefined) {
      const inventory = await db.hubInventory.findUnique({
        where: {
          hubId_productId: {
            hubId: params.hubId,
            productId: params.productId,
          },
        },
      });
      openingQty = inventory?.availableQty ?? 0;
      closingQty = openingQty + params.quantity;
    }

    await db.inventoryLedgerEntry.create({
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

    const totals = itemRows
      ? this.computeTotals(
          itemRows.map((row) => ({
            requestedQty: row.requestedQty,
            unitPrice: Number(row.unitPrice ?? 0),
          })),
        )
      : null;

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
    if (!['PENDING_APPROVAL', 'SUBMITTED'].includes(existing.status)) {
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

        if (item.allocatedQty < 0) {
          throw new BadRequestException('Allocated quantity cannot be negative');
        }

        const maxAllowed = Number(row.approvedQty ?? row.requestedQty);
        if (item.allocatedQty > maxAllowed) {
          throw new BadRequestException(
            `Cannot allocate more than approved quantity for ${row.productName}`,
          );
        }

        // Concurrency-safe reservation: atomic decrement only if enough available
        const locked = await tx.$queryRaw<
          Array<{ id: string; available_qty: number; reserved_qty: number }>
        >`
          SELECT id, available_qty, reserved_qty
          FROM hub_inventory
          WHERE hub_id = ${warehouseHub.id}::uuid
            AND product_id = ${row.productId}::uuid
          FOR UPDATE
        `;

        const inventory = locked[0];
        const available = inventory?.available_qty ?? 0;
        if (!inventory || available < item.allocatedQty) {
          throw new BadRequestException(
            `Insufficient warehouse stock for ${row.productName}. Available: ${available}, Requested: ${item.allocatedQty}`,
          );
        }

        const openingQty = available;
        const closingQty = available - item.allocatedQty;

        await tx.hubInventory.update({
          where: { id: inventory.id },
          data: {
            availableQty: { decrement: item.allocatedQty },
            reservedQty: { increment: item.allocatedQty },
          },
        });

        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: {
            allocatedQty: item.allocatedQty,
            status: 'ALLOCATED',
          },
        });

        await this.writeLedger(
          {
            hubId: warehouseHub.id,
            productId: row.productId,
            requisitionId: id,
            type: 'REQUISITION_ALLOCATE',
            quantity: -item.allocatedQty,
            openingQty,
            closingQty,
            referenceNo: existing.requestNo,
            remarks: `Allocated to ${existing.hub.name}`,
            createdBy: actor.name,
          },
          tx,
        );
      }

      const allItems = await tx.requisitionItem.findMany({
        where: { requisitionId: id },
      });
      const fullyAllocated = allItems.every((item) => {
        const approved = Number(item.approvedQty ?? item.requestedQty);
        return Number(item.allocatedQty ?? 0) >= approved;
      });

      return tx.requisition.update({
        where: { id },
        data: {
          status: fullyAllocated ? 'ALLOCATED' : 'ALLOCATED',
          allocatedBy: actor.id,
          allocatedByName: actor.name,
          allocatedAt: new Date(),
          warehouseHubId: warehouseHub.id,
          warehouseId: warehouseHub.code ?? MAIN_WAREHOUSE.id,
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
    await this.notifyHub(
      existing.hubId,
      'Stock Allocated',
      `${existing.requestNo}: stock has been allocated at central warehouse.`,
      `/requisitions/${existing.id}`,
    );

    return this.mapDetail(updated);
  }

  async assignLogistics(
    id: string,
    actor: ActorContext,
    dto: {
      vehicleId?: string;
      driverId?: string;
      expectedDispatchDate?: string;
      comment?: string;
    },
  ) {
    const existing = await this.findOneRaw(id);
    if (existing.status !== 'ALLOCATED') {
      throw new BadRequestException(
        'Logistics can only be assigned on allocated transfers',
      );
    }

    if (!dto.vehicleId && !dto.driverId && !dto.expectedDispatchDate) {
      throw new BadRequestException('No logistics fields provided');
    }

    let vehicleRegistration = existing.vehicleRegistration;
    let driverName = existing.driverName;

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      if (!vehicle || !vehicle.isActive) {
        throw new BadRequestException('Invalid or inactive vehicle');
      }
      vehicleRegistration = vehicle.registration;
    }

    if (dto.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: dto.driverId },
      });
      if (!driver || !driver.isActive) {
        throw new BadRequestException('Invalid or inactive driver');
      }
      driverName = driver.name;
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        ...(dto.vehicleId
          ? {
              vehicleId: dto.vehicleId,
              vehicleRegistration,
            }
          : {}),
        ...(dto.driverId
          ? {
              driverId: dto.driverId,
              driverName,
            }
          : {}),
        ...(dto.expectedDispatchDate
          ? { expectedDispatchDate: new Date(dto.expectedDispatchDate) }
          : {}),
      },
      include: this.requisitionInclude(),
    });

    if (dto.vehicleId) {
      await this.activateTimelineStep(id, 'Vehicle Assigned', actor.name);
    }
    if (dto.driverId) {
      await this.activateTimelineStep(id, 'Driver Assigned', actor.name);
    }
    if (dto.comment?.trim()) {
      await this.addComment(id, actor, { message: dto.comment.trim() });
    }

    await this.writeAudit(
      id,
      actor,
      'ASSIGN_LOGISTICS',
      existing.status,
      existing.status,
    );

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
    const vehicleId = dto.vehicleId ?? existing.vehicleId;
    const driverId = dto.driverId ?? existing.driverId;

    if (!vehicleId) {
      throw new BadRequestException('Vehicle assignment is required before dispatch');
    }
    if (!driverId) {
      throw new BadRequestException('Driver assignment is required before dispatch');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle || !vehicle.isActive) {
      throw new BadRequestException('Invalid or inactive vehicle');
    }
    vehicleRegistration = vehicle.registration;

    const totalAllocatedBags = existing.items.reduce(
      (sum, item) =>
        sum + Number(item.allocatedQty ?? item.approvedQty ?? item.requestedQty),
      0,
    );
    const capacity = Number(vehicle.capacity ?? 0);
    // capacity is stored in tons for some vehicles; if capacity looks like bag count (>50) treat as bags
    const capacityBags =
      capacity > 0 && capacity <= 50 ? Math.floor(capacity * 1000) : Math.floor(capacity);
    if (capacityBags > 0 && totalAllocatedBags > capacityBags) {
      throw new BadRequestException(
        `Vehicle capacity insufficient. Capacity: ${capacityBags} bags, Material: ${totalAllocatedBags} bags`,
      );
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver || !driver.isActive) {
      throw new BadRequestException('Invalid or inactive driver');
    }
    driverName = driver.name;

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        const qty = item.allocatedQty ?? item.approvedQty ?? item.requestedQty;
        if (!qty) continue;

        const locked = await tx.$queryRaw<
          Array<{ id: string; available_qty: number; reserved_qty: number }>
        >`
          SELECT id, available_qty, reserved_qty
          FROM hub_inventory
          WHERE hub_id = ${warehouseHub.id}::uuid
            AND product_id = ${item.productId}::uuid
          FOR UPDATE
        `;
        const inventory = locked[0];
        if (!inventory) {
          throw new BadRequestException(
            `Warehouse inventory missing for ${item.productName}`,
          );
        }
        if (inventory.reserved_qty < qty) {
          throw new BadRequestException(
            `Reserved stock mismatch for ${item.productName}`,
          );
        }

        // Physical leave: reserved decreases; available already reduced at allocation
        await tx.hubInventory.update({
          where: { id: inventory.id },
          data: { reservedQty: { decrement: qty } },
        });

        await tx.requisitionItem.update({
          where: { id: item.id },
          data: { status: 'DISPATCHED' },
        });

        await this.writeLedger(
          {
            hubId: warehouseHub.id,
            productId: item.productId,
            requisitionId: id,
            type: 'REQUISITION_DISPATCH',
            quantity: -qty,
            openingQty: inventory.available_qty,
            closingQty: inventory.available_qty,
            referenceNo: existing.requestNo,
            remarks: `Dispatched to ${existing.hub.name}`,
            createdBy: actor.name,
          },
          tx,
        );
      }

      return tx.requisition.update({
        where: { id },
        data: {
          status: 'IN_TRANSIT',
          dispatchedAt: dto.dispatchDate ? new Date(dto.dispatchDate) : new Date(),
          vehicleId,
          driverId,
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
      `/transfers`,
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
    if (!['IN_TRANSIT', 'DISPATCHED'].includes(existing.status)) {
      throw new BadRequestException('Requisition is not ready for receiving');
    }

    for (const item of dto.items) {
      const row = existing.items.find((i) => i.id === item.itemId);
      if (!row) {
        throw new BadRequestException(`Unknown item: ${item.itemId}`);
      }
      const dispatched = Number(
        row.allocatedQty ?? row.approvedQty ?? row.requestedQty,
      );
      if (item.receivedQty > dispatched) {
        throw new BadRequestException(
          `Received quantity cannot exceed dispatched quantity for ${row.productName}`,
        );
      }
      if (item.receivedQty < dispatched) {
        const shortage =
          item.shortageQty ?? dispatched - item.receivedQty;
        if (!item.remarks?.trim() && shortage > 0) {
          throw new BadRequestException(
            `Shortage reason/remarks required for ${row.productName}`,
          );
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const receiptCount = await tx.requisition.count({
        where: {
          status: { in: ['RECEIVED', 'COMPLETED'] },
          receivedAt: { not: null },
        },
      });
      const grnNumber = `GRN-${year}-${String(receiptCount + 1).padStart(5, '0')}`;

      for (const item of dto.items) {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) continue;

        const dispatched = Number(
          row.allocatedQty ?? row.approvedQty ?? row.requestedQty,
        );
        const shortageQty =
          item.shortageQty ?? Math.max(0, dispatched - item.receivedQty);

        await tx.requisitionItem.update({
          where: { id: item.itemId },
          data: {
            receivedQty: item.receivedQty,
            shortageQty,
            damageQty: item.damageQty ?? 0,
            missingQty: item.missingQty ?? 0,
            remarks: item.remarks,
            status: 'RECEIVED',
          },
        });

        if (item.receivedQty > 0) {
          const existingInv = await tx.hubInventory.findUnique({
            where: { hubId_productId: { hubId, productId: row.productId } },
          });
          const openingQty = existingInv?.availableQty ?? 0;

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

          await this.writeLedger(
            {
              hubId,
              productId: row.productId,
              requisitionId: id,
              type: 'REQUISITION_RECEIVE',
              quantity: item.receivedQty,
              openingQty,
              closingQty: openingQty + item.receivedQty,
              referenceNo: existing.requestNo,
              remarks: item.remarks ?? `Received under ${grnNumber}`,
              createdBy: actor.name,
            },
            tx,
          );
        }
      }

      const documents = [
        ...(dto.documents ?? []).map((doc, index) => ({
          id: `doc-${index}`,
          url: doc.url,
          name: doc.name ?? `Document ${index + 1}`,
          type: doc.type ?? 'OTHER',
          size: doc.size ?? '—',
          uploadedAt: new Date().toISOString(),
        })),
        {
          id: `grn-${grnNumber}`,
          url: '',
          name: grnNumber,
          type: 'GRN',
          grnNumber,
          size: '—',
          uploadedAt: new Date().toISOString(),
        },
      ];

      const hasShortage = dto.items.some((item) => {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) return false;
        const dispatched = Number(
          row.allocatedQty ?? row.approvedQty ?? row.requestedQty,
        );
        const shortageQty =
          item.shortageQty ?? Math.max(0, dispatched - item.receivedQty);
        return shortageQty > 0 || item.receivedQty < dispatched;
      });

      return tx.requisition.update({
        where: { id },
        data: {
          status: hasShortage ? 'RECEIVED' : 'COMPLETED',
          receivedBy: actor.id,
          receivedByName: actor.name,
          receivedAt: new Date(),
          ...(hasShortage ? {} : { completedAt: new Date() }),
          ...(dto.photoUrls?.length
            ? {
                receivingPhotos: dto.photoUrls.map((url, index) => ({
                  id: `photo-${index}`,
                  url,
                  uploadedAt: new Date().toISOString(),
                })),
              }
            : {}),
          receivingDocuments: documents,
        },
        include: this.requisitionInclude(),
      });
    });

    const finalStatus = updated.status;
    await this.activateTimelineStep(id, 'Hub Received', actor.name);
    if (finalStatus === 'COMPLETED') {
      await this.activateTimelineStep(id, 'Completed');
    }
    await this.writeAudit(id, actor, 'RECEIVE', existing.status, finalStatus);

    const shortageLines = dto.items
      .map((item) => {
        const row = existing.items.find((i) => i.id === item.itemId);
        if (!row) return null;
        const dispatched = Number(
          row.allocatedQty ?? row.approvedQty ?? row.requestedQty,
        );
        const shortage = Math.max(0, dispatched - item.receivedQty);
        if (shortage <= 0) return null;
        return `${row.productName}: shortage ${shortage} ${row.unit}`;
      })
      .filter(Boolean);

    // Notify central warehouse admins via hub notification is hub-scoped;
    // still notify destination hub and include shortage in message for ops.
    await this.notifyHub(
      existing.hubId,
      finalStatus === 'COMPLETED'
        ? 'Delivery Received'
        : 'Partial Delivery Received',
      finalStatus === 'COMPLETED'
        ? `${existing.requestNo} received and completed. Inventory updated.`
        : `${existing.requestNo} partially received. ${shortageLines.join('; ')}`,
      `/transfers`,
    );
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
