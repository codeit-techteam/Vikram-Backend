import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { RequisitionsService } from '../../modules/requisitions/requisitions.service';
import {
  normalizeMediaUrl,
  pickPreferredMediaUrl,
} from '../../common/utils/media-url';
import type {
  Prisma,
  RequisitionStatus,
} from '../../../generated/prisma/client';

export interface WarehouseInventoryQuery {
  search?: string;
  categoryId?: string;
  status?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'all';
  page?: number;
  limit?: number;
}

export interface WarehouseTransferQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  /** Destination hub UUID — warehouse → hub transfers for a specific sub-hub */
  destinationHubId?: string;
  hubId?: string;
}

function extractGrnNumber(documents: unknown): string | undefined {
  if (!Array.isArray(documents)) return undefined;
  const grn = documents.find(
    (doc) =>
      doc &&
      typeof doc === 'object' &&
      'type' in doc &&
      String((doc as { type?: string }).type).toUpperCase() === 'GRN',
  ) as { name?: string; grnNumber?: string } | undefined;
  return grn?.grnNumber ?? grn?.name;
}

@Injectable()
export class AdminWarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requisitionsService: RequisitionsService,
  ) {}

  private async warehouseHub() {
    return this.requisitionsService.resolveWarehouseHub();
  }

  private stockStatus(
    available: number,
    reserved: number,
    threshold: number,
  ): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
    const current = available + reserved;
    if (current <= 0 || available <= 0) return 'OUT_OF_STOCK';
    if (available <= threshold) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  async getDashboard() {
    const warehouse = await this.warehouseHub();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      productCount,
      inventoryRows,
      pendingRequisitions,
      awaitingAllocation,
      readyForDispatch,
      inTransit,
      arrivedOrReceived,
      dispatchedToday,
      recentLedger,
      criticalRequisitions,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { deletedAt: null, isVisible: true },
      }),
      this.prisma.hubInventory.findMany({
        where: { hubId: warehouse.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              deletedAt: true,
            },
          },
        },
      }),
      this.prisma.requisition.count({
        where: {
          status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] },
        },
      }),
      this.prisma.requisition.count({
        where: { status: 'APPROVED' },
      }),
      this.prisma.requisition.count({
        where: { status: 'ALLOCATED' },
      }),
      this.prisma.requisition.count({
        where: { status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
      }),
      this.prisma.requisition.count({
        where: { status: { in: ['RECEIVED', 'COMPLETED'] } },
      }),
      this.prisma.requisition.count({
        where: {
          dispatchedAt: { gte: todayStart },
          status: { in: ['DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'] },
        },
      }),
      this.prisma.inventoryLedgerEntry.findMany({
        where: { hubId: warehouse.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          product: { select: { name: true, sku: true, unit: true } },
        },
      }),
      this.prisma.requisition.findMany({
        where: {
          status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] },
          priority: { in: ['HIGH', 'URGENT'] },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 8,
        include: {
          hub: { select: { name: true } },
          items: { take: 1 },
        },
      }),
    ]);

    const activeInventory = inventoryRows.filter((r) => !r.product.deletedAt);
    const lowStockItems = activeInventory.filter((row) => {
      const status = this.stockStatus(
        row.availableQty,
        row.reservedQty,
        row.lowStockThreshold,
      );
      return status === 'LOW_STOCK' || status === 'OUT_OF_STOCK';
    });

    const stats = [
      {
        id: 'total-products',
        label: 'Total Products',
        value: String(productCount).padStart(2, '0'),
        subtitle: 'Active SKUs in catalog',
        icon: 'inventory' as const,
        href: '/central-warehouse/products',
      },
      {
        id: 'pending-requisitions',
        label: 'Pending Requisitions',
        value: String(pendingRequisitions).padStart(2, '0'),
        subtitle: 'Awaiting warehouse review',
        icon: 'requisitions' as const,
        variant:
          pendingRequisitions > 0 ? ('warning' as const) : ('default' as const),
        href: '/central-warehouse/requisitions',
      },
      {
        id: 'dispatched-today',
        label: 'Dispatched Today',
        value: String(dispatchedToday).padStart(2, '0'),
        subtitle: 'Transfers left warehouse today',
        icon: 'dispatch' as const,
        href: '/central-warehouse/dispatch',
      },
      {
        id: 'low-stock',
        label: 'Low Stock Items',
        value: String(lowStockItems.length).padStart(2, '0'),
        subtitle: 'Below reorder threshold',
        icon: 'low-stock' as const,
        variant:
          lowStockItems.length > 0
            ? ('warning' as const)
            : ('default' as const),
        href: '/central-warehouse/inventory?status=LOW_STOCK',
      },
    ];

    return {
      warehouse: {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
      },
      stats,
      counters: {
        totalProducts: productCount,
        pendingRequisitions,
        awaitingAllocation,
        pendingDispatch: readyForDispatch,
        inTransit,
        reachedHub: arrivedOrReceived,
        dispatchedToday,
        lowStockItems: lowStockItems.length,
      },
      criticalRequisitions: criticalRequisitions.map((row) => {
        const first = row.items[0];
        return {
          id: row.id,
          requestId: row.requestNo,
          hubName: row.hub.name,
          material: first?.productName ?? `${row.totalItems} items`,
          quantity: first
            ? `${first.requestedQty} ${first.unit}`
            : `${row.totalQty} units`,
          priority:
            row.priority === 'URGENT'
              ? 'critical'
              : row.priority === 'HIGH'
                ? 'high'
                : 'medium',
          href: `/central-warehouse/requisitions?id=${row.id}`,
        };
      }),
      lowStockAlerts: lowStockItems.slice(0, 8).map((row) => ({
        id: row.id,
        productName: row.product.name,
        currentStock: `${row.availableQty} ${row.product.unit}`,
        minimumStock: `${row.lowStockThreshold} ${row.product.unit}`,
        severity:
          row.availableQty <= 0 ||
          row.availableQty <= Math.floor(row.lowStockThreshold * 0.5)
            ? ('critical' as const)
            : ('warning' as const),
      })),
      activities: recentLedger.map((entry) => ({
        id: entry.id,
        sku: entry.product.sku ?? '—',
        productName: entry.product.name,
        type: entry.type,
        quantity: `${entry.quantity > 0 ? '+' : ''}${entry.quantity} ${entry.product.unit}`,
        referenceNo: entry.referenceNo,
        remarks: entry.remarks,
        createdBy: entry.createdBy,
        timestamp: entry.createdAt.toISOString(),
      })),
    };
  }

  async listInventory(query: WarehouseInventoryQuery) {
    const warehouse = await this.warehouseHub();
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    const rows = await this.prisma.hubInventory.findMany({
      where: {
        hubId: warehouse.id,
        product: productWhere,
      },
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
            images: {
              where: { deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
              select: { url: true, isPrimary: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const mapped = rows.map((row) => {
      const currentStock = row.availableQty + row.reservedQty;
      const available = row.availableQty;
      const status = this.stockStatus(
        row.availableQty,
        row.reservedQty,
        row.lowStockThreshold,
      );
      const categorySlug = (row.product.category?.slug ?? 'other')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      const preferredUrl = pickPreferredMediaUrl(
        row.product.images.map((img) => img.url),
      );
      const imageUrl =
        normalizeMediaUrl(preferredUrl, {
          updatedAt: row.product.updatedAt,
        }) ?? null;

      return {
        id: row.id,
        productId: row.productId,
        productName: row.product.name,
        sku: row.product.sku ?? '—',
        category: row.product.category?.name ?? 'Uncategorized',
        categorySlug,
        categoryId: row.product.categoryId,
        brand: row.product.brand,
        imageUrl,
        currentStock,
        committedStock: row.reservedQty,
        reservedStock: row.reservedQty,
        availableStock: available,
        minimumStock: row.minimumStock || row.lowStockThreshold,
        lowStockThreshold: row.lowStockThreshold,
        maximumStock: row.maximumStock,
        unit: row.product.unit,
        purchasePrice: Number(row.product.retailPrice),
        status,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    const filtered =
      query.status && query.status !== 'all'
        ? mapped.filter((item) => item.status === query.status)
        : mapped;

    const total = filtered.length;
    const data = filtered.slice(skip, skip + limit);

    const stats = {
      inventoryItems: mapped.length,
      lowStockAlerts: mapped.filter((i) => i.status === 'LOW_STOCK').length,
      outOfStockItems: mapped.filter((i) => i.status === 'OUT_OF_STOCK').length,
      totalStockValue: mapped
        .reduce((sum, i) => sum + i.currentStock * i.purchasePrice, 0)
        .toLocaleString('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }),
    };

    return {
      data,
      stats,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      warehouse: {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
      },
    };
  }

  async exportInventoryCsv(query: WarehouseInventoryQuery) {
    const result = await this.listInventory({
      ...query,
      page: 1,
      limit: 10000,
    });
    const header = [
      'Product Name',
      'SKU',
      'Category',
      'Current Stock',
      'Reserved',
      'Available',
      'Minimum Stock',
      'Unit',
      'Purchase Price',
      'Status',
    ];
    const lines = result.data.map((item) =>
      [
        item.productName,
        item.sku,
        item.category,
        item.currentStock,
        item.reservedStock,
        item.availableStock,
        item.minimumStock,
        item.unit,
        item.purchasePrice,
        item.status,
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  private mapTransferStatus(
    status: RequisitionStatus,
  ):
    | 'DRAFT'
    | 'TRANSFER_CREATED'
    | 'LOADING'
    | 'READY_FOR_DISPATCH'
    | 'IN_TRANSIT'
    | 'REACHED_HUB'
    | 'DELIVERED'
    | 'CANCELLED' {
    switch (status) {
      case 'ALLOCATED':
        return 'READY_FOR_DISPATCH';
      case 'DISPATCHED':
      case 'IN_TRANSIT':
        return 'IN_TRANSIT';
      case 'RECEIVED':
        return 'REACHED_HUB';
      case 'COMPLETED':
        return 'DELIVERED';
      case 'REJECTED':
        return 'CANCELLED';
      default:
        return 'TRANSFER_CREATED';
    }
  }

  async listTransfers(query: WarehouseTransferQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const statusFilter = this.resolveTransferStatusFilter(query.status);
    const destinationHubId = query.destinationHubId || query.hubId;

    const where: Prisma.RequisitionWhereInput = {
      status: statusFilter
        ? { in: statusFilter }
        : {
            in: [
              'ALLOCATED',
              'DISPATCHED',
              'IN_TRANSIT',
              'RECEIVED',
              'COMPLETED',
            ],
          },
      ...(destinationHubId ? { hubId: destinationHubId } : {}),
      ...(query.search
        ? {
            OR: [
              { requestNo: { contains: query.search, mode: 'insensitive' } },
              {
                vehicleRegistration: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { driverName: { contains: query.search, mode: 'insensitive' } },
              {
                hub: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          hub: { select: { id: true, code: true, name: true } },
          warehouseHub: { select: { id: true, code: true, name: true } },
          vehicle: {
            select: {
              id: true,
              registration: true,
              capacity: true,
              vehicleType: true,
            },
          },
          driver: { select: { id: true, name: true, phone: true } },
          items: true,
          timeline: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.requisition.count({ where }),
    ]);

    const data = rows.map((row) => this.mapTransferListItem(row));

    const hubScope = destinationHubId ? { hubId: destinationHubId } : {};
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      pendingDispatch,
      inTransit,
      reachedHub,
      completed,
      dispatchedToday,
      deliveredToday,
      delayedTransfers,
    ] = await Promise.all([
      this.prisma.requisition.count({
        where: { ...hubScope, status: 'ALLOCATED' },
      }),
      this.prisma.requisition.count({
        where: {
          ...hubScope,
          status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
        },
      }),
      this.prisma.requisition.count({
        where: { ...hubScope, status: 'RECEIVED' },
      }),
      this.prisma.requisition.count({
        where: { ...hubScope, status: 'COMPLETED' },
      }),
      this.prisma.requisition.count({
        where: {
          ...hubScope,
          status: { in: ['DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'] },
          dispatchedAt: { gte: todayStart },
        },
      }),
      this.prisma.requisition.count({
        where: {
          ...hubScope,
          status: { in: ['RECEIVED', 'COMPLETED'] },
          OR: [
            { receivedAt: { gte: todayStart } },
            { completedAt: { gte: todayStart } },
          ],
        },
      }),
      this.prisma.requisition.count({
        where: {
          ...hubScope,
          status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
          estimatedArrival: { lt: new Date() },
        },
      }),
    ]);

    return {
      data,
      stats: {
        total,
        pendingDispatch,
        inTransit,
        reachedHub,
        completed,
        dispatchedToday,
        deliveredToday,
        delayedTransfers,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getTransfer(id: string) {
    const candidates = [id];
    // UI transfer IDs are often TRN-* mirrors of requestNo (REQ-*)
    if (id.toUpperCase().startsWith('TRN-')) {
      candidates.push(`REQ-${id.slice(4)}`);
    } else if (id.toUpperCase().startsWith('REQ-')) {
      candidates.push(`TRN-${id.slice(4)}`);
    } else if (id.toUpperCase().startsWith('ALC-')) {
      candidates.push(`REQ-${id.slice(4)}`);
    }

    const transferStatuses = [
      'ALLOCATED',
      'DISPATCHED',
      'IN_TRANSIT',
      'RECEIVED',
      'COMPLETED',
    ] as const;

    const row = await this.prisma.requisition.findFirst({
      where: {
        OR: [{ id }, ...candidates.map((value) => ({ requestNo: value }))],
        status: { in: [...transferStatuses] },
      },
      include: {
        hub: { select: { id: true, code: true, name: true, city: true } },
        warehouseHub: { select: { id: true, code: true, name: true } },
        vehicle: true,
        driver: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                category: { select: { name: true } },
              },
            },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        comments: { orderBy: { createdAt: 'desc' } },
      },
    });

    // If found but not yet allocated, surface a clearer error than a blank 404
    if (!row) {
      const anyStatus = await this.prisma.requisition.findFirst({
        where: {
          OR: [{ id }, ...candidates.map((value) => ({ requestNo: value }))],
        },
        select: { id: true, requestNo: true, status: true },
      });
      if (anyStatus) {
        throw new NotFoundException(
          `Transfer ${anyStatus.requestNo} exists but is not ready yet (status: ${anyStatus.status}). Allocate stock first.`,
        );
      }
      throw new NotFoundException('Transfer not found');
    }

    return this.mapTransferDetail(row);
  }

  private resolveTransferStatusFilter(
    status?: string,
  ): RequisitionStatus[] | null {
    if (!status || status === 'all') return null;
    const normalized = status.toUpperCase();
    if (
      normalized === 'READY_FOR_DISPATCH' ||
      normalized === 'PENDING_DISPATCH'
    ) {
      return ['ALLOCATED'];
    }
    if (normalized === 'IN_TRANSIT') return ['DISPATCHED', 'IN_TRANSIT'];
    if (normalized === 'REACHED_HUB') return ['RECEIVED'];
    if (normalized === 'DELIVERED' || normalized === 'COMPLETED') {
      return ['COMPLETED'];
    }
    if (normalized === 'ALLOCATED') return ['ALLOCATED'];
    return null;
  }

  private mapTransferListItem(row: {
    id: string;
    requestNo: string;
    status: RequisitionStatus;
    createdAt: Date;
    allocatedAt: Date | null;
    dispatchedAt: Date | null;
    receivedAt: Date | null;
    completedAt: Date | null;
    estimatedArrival: Date | null;
    expectedDispatchDate: Date | null;
    vehicleId: string | null;
    driverId: string | null;
    vehicleRegistration: string | null;
    driverName: string | null;
    totalQty: number;
    hub: { id: string; name: string };
    warehouseHub: { id: string; name: string } | null;
    vehicle: {
      id: string;
      registration: string;
      capacity: unknown;
      vehicleType: unknown;
    } | null;
    driver: { id: string; name: string; phone: string } | null;
    items: Array<{
      productName: string;
      sku: string | null;
      unit: string;
      allocatedQty: number | null;
      approvedQty: number | null;
      requestedQty: number;
    }>;
    timeline: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      createdAt: Date;
      stepStatus?: string;
      status?: string;
    }>;
  }) {
    const first = row.items[0];
    const qty =
      first?.allocatedQty ??
      first?.approvedQty ??
      first?.requestedQty ??
      row.totalQty;
    const uiStatus = this.mapTransferStatus(row.status);

    return {
      id: row.id,
      transferId: row.requestNo.replace(/^REQ-/, 'TRN-'),
      allocationId: row.id,
      requisitionId: row.id,
      requestNo: row.requestNo,
      sourceWarehouseId: row.warehouseHub?.id ?? '',
      sourceWarehouse: row.warehouseHub?.name ?? 'Central Warehouse',
      destinationHubId: row.hub.id,
      destinationHub: row.hub.name,
      vehicleNumber:
        row.vehicleRegistration ?? row.vehicle?.registration ?? undefined,
      vehicleId: row.vehicleId ?? row.vehicle?.id ?? undefined,
      driverId: row.driverId ?? row.driver?.id ?? undefined,
      assignedDriver: row.driver
        ? {
            id: row.driver.id,
            name: row.driver.name,
            phone: row.driver.phone,
          }
        : row.driverName
          ? { id: 'snapshot', name: row.driverName, phone: '' }
          : undefined,
      status: uiStatus,
      material: first?.productName,
      sku: first?.sku ?? undefined,
      quantity: qty,
      quantityUnit: first?.unit ?? 'units',
      dispatchDate: row.dispatchedAt?.toISOString(),
      expectedArrival: row.estimatedArrival?.toISOString(),
      createdAt: (row.allocatedAt ?? row.createdAt).toISOString(),
      dispatchAt: row.dispatchedAt?.toISOString(),
      eta: row.estimatedArrival?.toISOString() ?? '',
      deliveredAt: row.completedAt?.toISOString(),
      hubReceivedAt: row.receivedAt?.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      materials: row.items.map((i) => i.productName),
      timeline: row.timeline.map((step) => ({
        id: step.id,
        type: step.title.toUpperCase().replace(/\s+/g, '_'),
        label: step.title,
        timestamp: step.createdAt.toISOString(),
        description: step.subtitle ?? undefined,
      })),
      activityLogs: [],
      documents: [],
    };
  }

  private mapTransferDetail(row: {
    id: string;
    requestNo: string;
    status: RequisitionStatus;
    createdAt: Date;
    allocatedAt: Date | null;
    dispatchedAt: Date | null;
    receivedAt: Date | null;
    completedAt: Date | null;
    estimatedArrival: Date | null;
    expectedDispatchDate: Date | null;
    vehicleId: string | null;
    driverId: string | null;
    vehicleRegistration: string | null;
    driverName: string | null;
    totalQty: number;
    receivingPhotos: unknown;
    receivingDocuments: unknown;
    hub: { id: string; name: string };
    warehouseHub: { id: string; name: string } | null;
    vehicle: {
      id: string;
      registration: string;
      capacity: unknown;
      vehicleType: unknown;
    } | null;
    driver: { id: string; name: string; phone: string } | null;
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string | null;
      unit: string;
      requestedQty: number;
      approvedQty: number | null;
      allocatedQty: number | null;
      receivedQty: number | null;
      shortageQty: number | null;
      damageQty: number | null;
      product?: { category?: { name: string } | null } | null;
    }>;
    timeline: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      createdAt: Date;
      stepStatus?: string;
      status?: string;
    }>;
    auditLogs?: Array<{
      id: string;
      action: string;
      actorName: string;
      actorRole: string;
      previousValue: unknown;
      newValue: unknown;
      createdAt: Date;
    }>;
    comments?: unknown;
  }) {
    const list = this.mapTransferListItem(row);
    return {
      ...list,
      items: row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unit: item.unit,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty,
        allocatedQty: item.allocatedQty,
        receivedQty: item.receivedQty,
        shortageQty: item.shortageQty,
        damageQty: item.damageQty,
        category: item.product?.category?.name,
      })),
      receivingPhotos: row.receivingPhotos,
      receivingDocuments: row.receivingDocuments,
      grnNumber: extractGrnNumber(row.receivingDocuments),
      auditLogs: row.auditLogs?.map((log) => ({
        id: log.id,
        action: log.action,
        actorName: log.actorName,
        actorRole: log.actorRole,
        previousValue: log.previousValue,
        newValue: log.newValue,
        createdAt: log.createdAt.toISOString(),
      })),
      comments: row.comments,
      rawStatus: row.status,
    };
  }

  async listAllocations(query: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.RequisitionWhereInput = {
      status: { in: ['APPROVED', 'ALLOCATED'] },
      ...(query.search
        ? {
            OR: [
              { requestNo: { contains: query.search, mode: 'insensitive' } },
              {
                hub: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.status === 'APPROVED' || query.status === 'ALLOCATED'
        ? { status: query.status }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          hub: { select: { id: true, name: true, code: true } },
          items: true,
        },
      }),
      this.prisma.requisition.count({ where }),
    ]);

    const warehouse = await this.warehouseHub();

    const data = await Promise.all(
      rows.map(async (row) => {
        const first = row.items[0];
        let warehouseAvailable: number | null = null;
        if (first) {
          const inv = await this.prisma.hubInventory.findUnique({
            where: {
              hubId_productId: {
                hubId: warehouse.id,
                productId: first.productId,
              },
            },
          });
          warehouseAvailable = inv?.availableQty ?? 0;
        }

        return {
          id: row.id,
          allocationId: `ALC-${row.requestNo.replace(/^REQ-/, '')}`,
          requisitionId: row.id,
          requestId: row.requestNo,
          hubId: row.hubId,
          hubName: row.hub.name,
          status: row.status,
          priority: row.priority,
          material: first?.productName ?? `${row.totalItems} items`,
          sku: first?.sku,
          requestedQty: first?.requestedQty ?? row.totalQty,
          approvedQty:
            first?.approvedQty ?? first?.requestedQty ?? row.totalQty,
          allocatedQty: first?.allocatedQty ?? 0,
          unit: first?.unit ?? 'units',
          warehouseAvailable,
          expectedDate: row.expectedDate.toISOString(),
          createdAt: row.createdAt.toISOString(),
          approvedAt: row.approvedAt?.toISOString(),
          allocatedAt: row.allocatedAt?.toISOString(),
          items: row.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            requestedQty: item.requestedQty,
            approvedQty: item.approvedQty,
            allocatedQty: item.allocatedQty,
            warehouseStock: item.warehouseStock,
            unit: item.unit,
          })),
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adjustInventory(params: {
    productId: string;
    availableQty?: number;
    reservedQty?: number;
    lowStockThreshold?: number;
    minimumStock?: number;
    maximumStock?: number | null;
    remarks?: string;
    actorName: string;
  }) {
    const warehouse = await this.warehouseHub();
    const product = await this.prisma.product.findFirst({
      where: { id: params.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (params.availableQty !== undefined && params.availableQty < 0) {
      throw new BadRequestException('Available quantity cannot be negative');
    }
    if (params.reservedQty !== undefined && params.reservedQty < 0) {
      throw new BadRequestException('Reserved quantity cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.hubInventory.findUnique({
        where: {
          hubId_productId: {
            hubId: warehouse.id,
            productId: params.productId,
          },
        },
      });

      const opening = existing?.availableQty ?? 0;
      const nextAvailable =
        params.availableQty !== undefined ? params.availableQty : opening;
      const delta = nextAvailable - opening;

      const inventory = await tx.hubInventory.upsert({
        where: {
          hubId_productId: {
            hubId: warehouse.id,
            productId: params.productId,
          },
        },
        create: {
          hubId: warehouse.id,
          productId: params.productId,
          availableQty: params.availableQty ?? 0,
          reservedQty: params.reservedQty ?? 0,
          lowStockThreshold: params.lowStockThreshold ?? 10,
          minimumStock: params.minimumStock ?? 0,
          maximumStock: params.maximumStock ?? undefined,
        },
        update: {
          ...(params.availableQty !== undefined && {
            availableQty: params.availableQty,
          }),
          ...(params.reservedQty !== undefined && {
            reservedQty: params.reservedQty,
          }),
          ...(params.lowStockThreshold !== undefined && {
            lowStockThreshold: params.lowStockThreshold,
          }),
          ...(params.minimumStock !== undefined && {
            minimumStock: params.minimumStock,
          }),
          ...(params.maximumStock !== undefined && {
            maximumStock: params.maximumStock,
          }),
        },
      });

      if (delta !== 0) {
        await tx.inventoryLedgerEntry.create({
          data: {
            hubId: warehouse.id,
            productId: params.productId,
            type: 'ADJUSTMENT',
            quantity: delta,
            openingQty: opening,
            closingQty: nextAvailable,
            referenceNo: `ADJ-${Date.now()}`,
            remarks: params.remarks ?? 'Warehouse stock adjustment',
            createdBy: params.actorName,
          },
        });
      }

      return inventory;
    });
  }
}
