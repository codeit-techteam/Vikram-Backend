import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubInventoryRepository } from '../repositories/hub-inventory.repository';
import type { HubSearchQueryDto } from '../dto/hub.dto';

export type HubSearchHitType =
  | 'orders'
  | 'inventory'
  | 'products'
  | 'drivers'
  | 'vehicles'
  | 'dispatches'
  | 'requisitions';

export interface HubSearchHit {
  id: string;
  type: HubSearchHitType;
  title: string;
  subtitle: string;
  href: string;
  meta?: Record<string, string | number | null | undefined>;
}

@Injectable()
export class HubSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async search(hubId: string, query: HubSearchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const q = query.q.trim();
    const type = (query.type || 'all').toLowerCase();

    if (!q) {
      throw new BadRequestException('Search query is required');
    }

    if (type === 'all') {
      return this.searchAll(hubId, q);
    }

    switch (type) {
      case 'orders':
        return this.searchOrders(hubId, q, page, limit, skip);
      case 'products':
      case 'inventory':
        return this.searchProducts(hubId, q, page, limit, skip);
      case 'drivers':
        return this.searchDrivers(hubId, q, page, limit, skip);
      case 'vehicles':
        return this.searchVehicles(hubId, q, page, limit, skip);
      case 'dispatches':
        return this.searchDispatches(hubId, q, page, limit, skip);
      case 'requisitions':
        return this.searchRequisitions(hubId, q, page, limit, skip);
      default:
        throw new BadRequestException('Invalid search type');
    }
  }

  /** Unified hub-wide search for the header search bar. */
  private async searchAll(hubId: string, q: string) {
    const perType = 5;
    const [
      orders,
      inventory,
      drivers,
      vehicles,
      dispatches,
      requisitions,
    ] = await Promise.all([
      this.searchOrders(hubId, q, 1, perType, 0),
      this.searchProducts(hubId, q, 1, perType, 0),
      this.searchDrivers(hubId, q, 1, perType, 0),
      this.searchVehicles(hubId, q, 1, perType, 0),
      this.searchDispatches(hubId, q, 1, perType, 0),
      this.searchRequisitions(hubId, q, 1, perType, 0),
    ]);

    const groups = [
      {
        type: 'orders' as const,
        label: 'Orders',
        items: this.mapOrderHits(orders.data),
        total: orders.meta.total,
      },
      {
        type: 'inventory' as const,
        label: 'Products / SKU',
        items: this.mapInventoryHits(inventory.data),
        total: inventory.meta.total,
      },
      {
        type: 'vehicles' as const,
        label: 'Trucks / Vehicles',
        items: this.mapVehicleHits(vehicles.data),
        total: vehicles.meta.total,
      },
      {
        type: 'drivers' as const,
        label: 'Drivers',
        items: this.mapDriverHits(drivers.data),
        total: drivers.meta.total,
      },
      {
        type: 'dispatches' as const,
        label: 'Dispatches',
        items: this.mapDispatchHits(dispatches.data),
        total: dispatches.meta.total,
      },
      {
        type: 'requisitions' as const,
        label: 'Requisitions',
        items: this.mapRequisitionHits(requisitions.data),
        total: requisitions.meta.total,
      },
    ].filter((g) => g.items.length > 0);

    const results: HubSearchHit[] = groups.flatMap((g) => g.items);

    return {
      query: q,
      results,
      groups,
      meta: {
        total: groups.reduce((s, g) => s + g.total, 0),
        shown: results.length,
      },
    };
  }

  private async searchOrders(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      deletedAt: null,
      OR: [
        { orderNumber: { contains: q, mode: 'insensitive' as const } },
        {
          customer: {
            fullName: { contains: q, mode: 'insensitive' as const },
          },
        },
        { customer: { phone: { contains: q } } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isEmergency: 'desc' }, { createdAt: 'desc' }],
        include: { customer: { select: { fullName: true, phone: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchProducts(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      product: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { sku: { contains: q, mode: 'insensitive' as const } },
        ],
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.hubInventory.findMany({
        where,
        skip,
        take: limit,
        include: this.inventoryRepo.inventoryInclude(),
      }),
      this.prisma.hubInventory.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.inventoryRepo.mapInventoryRow(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchDrivers(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
        { licenseNumber: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        include: { vehicle: true },
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchVehicles(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      deletedAt: null,
      OR: [
        { registration: { contains: q, mode: 'insensitive' as const } },
        { vehicleCategory: { contains: q, mode: 'insensitive' as const } },
        { manufacturer: { contains: q, mode: 'insensitive' as const } },
        { model: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        include: { driver: true },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchDispatches(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      OR: [
        { dispatchNo: { contains: q, mode: 'insensitive' as const } },
        { trackingNo: { contains: q, mode: 'insensitive' as const } },
        {
          order: {
            orderNumber: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          vehicle: {
            registration: { contains: q, mode: 'insensitive' as const },
          },
        },
        {
          driver: { name: { contains: q, mode: 'insensitive' as const } },
        },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.hubDispatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, orderNumber: true } },
          vehicle: { select: { registration: true } },
          driver: { select: { name: true } },
        },
      }),
      this.prisma.hubDispatch.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchRequisitions(
    hubId: string,
    q: string,
    page: number,
    limit: number,
    skip: number,
  ) {
    const where = {
      hubId,
      OR: [
        { requestNo: { contains: q, mode: 'insensitive' as const } },
        { rejectionReason: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          requestNo: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.requisition.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private mapOrderHits(
    rows: Array<{
      id: string;
      orderNumber: string;
      orderStatus: string;
      customer?: { fullName?: string | null; phone?: string | null } | null;
    }>,
  ): HubSearchHit[] {
    return rows.map((o) => ({
      id: o.id,
      type: 'orders',
      title: o.orderNumber,
      subtitle: [o.customer?.fullName, o.orderStatus]
        .filter(Boolean)
        .join(' · '),
      href: `/orders/${o.id}`,
      meta: { status: o.orderStatus, phone: o.customer?.phone },
    }));
  }

  private mapInventoryHits(
    rows: Array<{
      id: string;
      productId: string;
      currentStock?: number;
      availableStock?: number;
      product: { name: string; sku: string | null; unit?: string };
    }>,
  ): HubSearchHit[] {
    return rows.map((r) => ({
      id: r.productId,
      type: 'inventory',
      title: r.product.name,
      subtitle: [
        r.product.sku ? `SKU ${r.product.sku}` : null,
        `Stock ${r.availableStock ?? r.currentStock ?? 0}${r.product.unit ? ` ${r.product.unit}` : ''}`,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/inventory?search=${encodeURIComponent(r.product.sku || r.product.name)}`,
      meta: {
        sku: r.product.sku,
        stock: r.availableStock ?? r.currentStock,
      },
    }));
  }

  private mapDriverHits(
    rows: Array<{
      id: string;
      name: string;
      phone?: string | null;
      licenseNumber?: string | null;
      vehicle?: { registration?: string | null } | null;
    }>,
  ): HubSearchHit[] {
    return rows.map((d) => ({
      id: d.id,
      type: 'drivers',
      title: d.name,
      subtitle: [d.phone, d.licenseNumber, d.vehicle?.registration]
        .filter(Boolean)
        .join(' · '),
      href: `/drivers?search=${encodeURIComponent(d.name)}`,
      meta: { phone: d.phone },
    }));
  }

  private mapVehicleHits(
    rows: Array<{
      id: string;
      registration: string;
      vehicleType?: string | null;
      vehicleCategory?: string | null;
      status?: string | null;
      driver?: { name?: string | null } | null;
    }>,
  ): HubSearchHit[] {
    return rows.map((v) => ({
      id: v.id,
      type: 'vehicles',
      title: v.registration,
      subtitle: [
        v.vehicleCategory || v.vehicleType,
        v.status,
        v.driver?.name,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/fleet?search=${encodeURIComponent(v.registration)}`,
      meta: { status: v.status },
    }));
  }

  private mapDispatchHits(
    rows: Array<{
      id: string;
      dispatchNo: string;
      trackingNo?: string | null;
      status: string;
      order?: { id: string; orderNumber: string } | null;
      vehicle?: { registration?: string | null } | null;
      driver?: { name?: string | null } | null;
    }>,
  ): HubSearchHit[] {
    return rows.map((d) => ({
      id: d.id,
      type: 'dispatches',
      title: d.trackingNo || d.dispatchNo,
      subtitle: [
        d.order?.orderNumber,
        d.vehicle?.registration,
        d.driver?.name,
        d.status,
      ]
        .filter(Boolean)
        .join(' · '),
      href: d.order?.id ? `/orders/${d.order.id}` : `/dispatch`,
      meta: { status: d.status },
    }));
  }

  private mapRequisitionHits(
    rows: Array<{
      id: string;
      requestNo: string;
      status: string;
      reason?: string | null;
    }>,
  ): HubSearchHit[] {
    return rows.map((r) => ({
      id: r.id,
      type: 'requisitions',
      title: r.requestNo,
      subtitle: [r.status, r.reason].filter(Boolean).join(' · '),
      href: `/requisitions?selected=${encodeURIComponent(r.requestNo)}`,
      meta: { status: r.status },
    }));
  }
}
