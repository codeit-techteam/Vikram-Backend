import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityStatus, HubRole, OrderStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { HubDashboardService } from '../../hub/dashboard/hub-dashboard.service';
import { HubInventoryRepository } from '../../hub/repositories/hub-inventory.repository';
import { AuditService } from '../audit/audit.service';
import type {
  AdminHubOrdersQueryDto,
  AdminHubQueryDto,
  AssignHubManagerDto,
  CreateAdminHubDto,
  UpdateAdminHubDto,
  UpdateHubStatusDto,
} from './dto/admin-hubs.dto';
import {
  HubDisplayStatus,
  HubOperationalAction,
  HubOrderGroup,
  HubSortField,
} from './dto/admin-hubs.dto';

const ORDER_GROUP_MAP: Record<HubOrderGroup, OrderStatus[]> = {
  PENDING: [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.HUB_ASSIGNED,
    OrderStatus.AWAITING_HUB_ALLOCATION,
  ],
  PROCESSING: [
    OrderStatus.PROCESSING,
    OrderStatus.PACKED,
    OrderStatus.READY_FOR_DISPATCH,
  ],
  DISPATCHED: [OrderStatus.DISPATCHED],
  DELIVERED: [OrderStatus.DELIVERED],
  CANCELLED: [OrderStatus.CANCELLED],
};

const PENDING_STATUSES: OrderStatus[] = [
  ...ORDER_GROUP_MAP.PENDING,
  ...ORDER_GROUP_MAP.PROCESSING,
  OrderStatus.DISPATCHED,
];

@Injectable()
export class AdminHubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly dashboardService: HubDashboardService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async findAll(query: AdminHubQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.HubWhereInput = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.state) {
      where.state = { contains: query.state, mode: 'insensitive' };
    }

    if (query.status) {
      this.applyStatusFilter(where, query.status);
    }

    if (query.manager) {
      where.users = {
        some: {
          deletedAt: null,
          role: HubRole.HUB_MANAGER,
          isActive: true,
          OR: [
            { id: query.manager },
            { fullName: { contains: query.manager, mode: 'insensitive' } },
            { employeeId: { contains: query.manager, mode: 'insensitive' } },
            { email: { contains: query.manager, mode: 'insensitive' } },
          ],
        },
      };
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [hubs, total] = await Promise.all([
      this.prisma.hub.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          users: {
            where: {
              deletedAt: null,
              role: HubRole.HUB_MANAGER,
              isActive: true,
            },
            take: 1,
            select: {
              id: true,
              fullName: true,
              employeeId: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              orders: { where: { deletedAt: null } },
              drivers: { where: { deletedAt: null, isActive: true } },
              vehicles: { where: { deletedAt: null, isActive: true } },
            },
          },
        },
      }),
      this.prisma.hub.count({ where }),
    ]);

    return {
      data: hubs.map((hub) => this.mapHubListItem(hub)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const hub = await this.getHubOrThrow(id);

    const hubScope = { hubId: id, deletedAt: null };

    const [
      manager,
      inventorySummary,
      pendingOrders,
      completedOrders,
      drivers,
      vehicles,
      performance,
    ] = await Promise.all([
      this.getActiveManager(id),
      this.getInventorySummary(id),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: PENDING_STATUSES } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
      }),
      this.prisma.driver.findMany({
        where: { hubId: id, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          availability: true,
          isActive: true,
          vehicle: { select: { id: true, registration: true, vehicleType: true } },
        },
        orderBy: { name: 'asc' },
        take: 50,
      }),
      this.prisma.vehicle.findMany({
        where: { hubId: id, deletedAt: null },
        select: {
          id: true,
          registration: true,
          vehicleType: true,
          capacity: true,
          status: true,
          isActive: true,
        },
        orderBy: { registration: 'asc' },
        take: 50,
      }),
      this.getPerformance(id),
    ]);

    return {
      hub: this.mapHub(hub),
      manager,
      inventorySummary,
      pendingOrders,
      completedOrders,
      drivers,
      vehicles,
      performance,
    };
  }

  async create(dto: CreateAdminHubDto, adminId: string, adminEmail: string) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.hub.findFirst({
      where: { code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Hub code "${code}" already exists`);
    }

    const created = await this.prisma.hub.create({
      data: {
        code,
        name: dto.name.trim(),
        addressLine1: dto.address.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city.trim(),
        state: dto.state.trim(),
        pincode: dto.pincode.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone?.trim(),
        email: dto.email?.trim().toLowerCase(),
        capacity: dto.capacity,
        workingHours: dto.workingHours?.trim(),
        status: dto.status ?? EntityStatus.ACTIVE,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'CREATE',
      resource: 'Hub',
      resourceId: created.id,
      newValue: { code, name: dto.name, city: dto.city },
    });

    return this.mapHub(created);
  }

  async update(
    id: string,
    dto: UpdateAdminHubDto,
    adminId: string,
    adminEmail: string,
  ) {
    const hub = await this.getHubOrThrow(id);

    if (dto.code) {
      const code = dto.code.trim().toUpperCase();
      const duplicate = await this.prisma.hub.findFirst({
        where: { code, deletedAt: null, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Hub code "${code}" already exists`);
      }
    }

    const updated = await this.prisma.hub.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
        ...(dto.address !== undefined && { addressLine1: dto.address.trim() }),
        ...(dto.addressLine2 !== undefined && {
          addressLine2: dto.addressLine2?.trim() ?? null,
        }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.state !== undefined && { state: dto.state.trim() }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode.trim() }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() ?? null }),
        ...(dto.email !== undefined && {
          email: dto.email?.trim().toLowerCase() ?? null,
        }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.workingHours !== undefined && {
          workingHours: dto.workingHours?.trim() ?? null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'Hub',
      resourceId: id,
      oldValue: this.mapHub(hub),
      newValue: dto,
    });

    return this.mapHub(updated);
  }

  async updateStatus(
    id: string,
    dto: UpdateHubStatusDto,
    adminId: string,
    adminEmail: string,
  ) {
    const hub = await this.getHubOrThrow(id);
    const { isActive, status } = this.resolveOperationalAction(dto.action);

    const updated = await this.prisma.hub.update({
      where: { id },
      data: { isActive, status },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'UPDATE',
      resource: 'Hub',
      resourceId: id,
      oldValue: { isActive: hub.isActive, status: hub.status },
      newValue: { action: dto.action, isActive, status },
    });

    return {
      ...this.mapHub(updated),
      action: dto.action,
      operationalStatus: this.deriveOperationalStatus(updated.isActive, updated.status),
    };
  }

  async remove(id: string, adminId: string, adminEmail: string) {
    await this.getHubOrThrow(id);

    const updated = await this.prisma.hub.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: EntityStatus.INACTIVE },
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'DELETE',
      resource: 'Hub',
      resourceId: id,
    });

    return this.mapHub(updated);
  }

  async assignManager(
    id: string,
    dto: AssignHubManagerDto,
    adminId: string,
    adminEmail: string,
  ) {
    await this.getHubOrThrow(id);

    const manager = await this.prisma.hubUser.findFirst({
      where: {
        id: dto.managerId,
        deletedAt: null,
        role: HubRole.HUB_MANAGER,
      },
    });
    if (!manager) {
      throw new NotFoundException('Hub manager not found');
    }

    const previousHubId = manager.hubId;

    await this.prisma.$transaction(async (tx) => {
      await tx.hubUser.updateMany({
        where: {
          hubId: id,
          role: HubRole.HUB_MANAGER,
          isActive: true,
          deletedAt: null,
          id: { not: dto.managerId },
        },
        data: { isActive: false },
      });

      await tx.hubRefreshToken.updateMany({
        where: {
          hubUser: {
            hubId: id,
            role: HubRole.HUB_MANAGER,
            id: { not: dto.managerId },
          },
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      await tx.hubUser.update({
        where: { id: dto.managerId },
        data: { hubId: id, isActive: true },
      });
    });

    await this.auditService.log({
      adminUserId: adminId,
      adminEmail,
      action: 'ASSIGN',
      resource: 'Hub',
      resourceId: id,
      newValue: {
        managerId: dto.managerId,
        previousHubId,
        managerName: manager.fullName,
      },
    });

    return this.getActiveManager(id);
  }

  async getInventorySummary(hubId: string) {
    await this.getHubOrThrow(hubId);

    const rows = await this.prisma.hubInventory.findMany({
      where: { hubId },
      include: this.inventoryRepo.inventoryInclude(),
    });

    let totalProducts = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let stockValue = 0;

    for (const row of rows) {
      const mapped = this.inventoryRepo.mapInventoryRow(row);
      totalProducts += 1;

      if (mapped.availableStock <= 0) {
        outOfStock += 1;
      } else if (mapped.lowStock) {
        lowStock += 1;
      }

      const price = Number(row.product.retailPrice ?? 0);
      stockValue += mapped.currentStock * price;
    }

    return {
      totalProducts,
      stockValue: Math.round(stockValue * 100) / 100,
      lowStock,
      outOfStock,
    };
  }

  async getOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    await this.getHubOrThrow(hubId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      hubId,
      deletedAt: null,
    };

    if (query.status) {
      where.orderStatus = { in: ORDER_GROUP_MAP[query.status] };
    }

    const [orders, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          paymentStatus: true,
          createdAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          customer: {
            select: { id: true, fullName: true, phone: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
      this.getOrderStatusCounts(hubId),
    ]);

    return {
      orders,
      statusCounts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPerformance(hubId: string) {
    await this.getHubOrThrow(hubId);

    const dashboard = await this.dashboardService.getDashboard(hubId);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const hubScope = { hubId, deletedAt: null };

    const [monthlyOrders, monthlyRevenue, dispatchMetrics] = await Promise.all([
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: monthStart } },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: monthStart },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          dispatchedAt: { not: null },
          deliveredAt: { not: null },
          createdAt: { gte: monthStart },
        },
        select: { dispatchedAt: true, deliveredAt: true },
        take: 200,
        orderBy: { deliveredAt: 'desc' },
      }),
    ]);

    let avgDispatchTimeHours = 0;
    if (dispatchMetrics.length > 0) {
      const totalHours = dispatchMetrics.reduce((sum, order) => {
        const dispatched = order.dispatchedAt!.getTime();
        const delivered = order.deliveredAt!.getTime();
        return sum + (delivered - dispatched) / (1000 * 60 * 60);
      }, 0);
      avgDispatchTimeHours =
        Math.round((totalHours / dispatchMetrics.length) * 10) / 10;
    }

    const totalInRange = dashboard.todaysOrders || 1;
    const fulfillmentPercent = Math.round(
      (dashboard.ordersDelivered / totalInRange) * 100,
    );

    return {
      todaysOrders: dashboard.todaysOrders,
      monthlyOrders,
      revenue: {
        today: dashboard.todaysRevenue,
        monthly: monthlyRevenue._sum.grandTotal ?? 0,
      },
      dispatchTime: avgDispatchTimeHours,
      fulfillmentPercent,
      hubPerformance: dashboard.hubPerformance,
    };
  }

  private async getOrderStatusCounts(hubId: string) {
    const hubScope = { hubId, deletedAt: null };
    const groups = Object.entries(ORDER_GROUP_MAP) as [HubOrderGroup, OrderStatus[]][];

    const counts = await Promise.all(
      groups.map(async ([group, statuses]) => ({
        group,
        count: await this.prisma.order.count({
          where: { ...hubScope, orderStatus: { in: statuses } },
        }),
      })),
    );

    return Object.fromEntries(counts.map(({ group, count }) => [group, count]));
  }

  private async getActiveManager(hubId: string) {
    const manager = await this.prisma.hubUser.findFirst({
      where: {
        hubId,
        deletedAt: null,
        role: HubRole.HUB_MANAGER,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        employeeId: true,
        email: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!manager) return null;

    return {
      id: manager.id,
      name: manager.fullName,
      fullName: manager.fullName,
      employeeId: manager.employeeId,
      email: manager.email,
      phone: manager.phone,
      lastLoginAt: manager.lastLoginAt,
      assignedAt: manager.createdAt,
    };
  }

  private async getHubOrThrow(id: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id, deletedAt: null },
    });
    if (!hub) throw new NotFoundException('Hub not found');
    return hub;
  }

  private applyStatusFilter(where: Prisma.HubWhereInput, status: string) {
    const normalized = status.toUpperCase();

    if (normalized === HubDisplayStatus.ENABLED) {
      where.isActive = true;
      where.status = EntityStatus.ACTIVE;
      return;
    }
    if (normalized === HubDisplayStatus.DISABLED) {
      where.isActive = false;
      where.status = EntityStatus.INACTIVE;
      return;
    }
    if (normalized === HubDisplayStatus.SUSPENDED) {
      where.isActive = false;
      where.status = EntityStatus.DRAFT;
      return;
    }

    if (Object.values(EntityStatus).includes(normalized as EntityStatus)) {
      where.status = normalized as EntityStatus;
    }
  }

  private resolveOperationalAction(action: HubOperationalAction): {
    isActive: boolean;
    status: EntityStatus;
  } {
    switch (action) {
      case HubOperationalAction.ENABLE:
        return { isActive: true, status: EntityStatus.ACTIVE };
      case HubOperationalAction.DISABLE:
        return { isActive: false, status: EntityStatus.INACTIVE };
      case HubOperationalAction.SUSPEND:
        return { isActive: false, status: EntityStatus.DRAFT };
      default:
        throw new BadRequestException('Invalid hub status action');
    }
  }

  private deriveOperationalStatus(
    isActive: boolean,
    status: EntityStatus,
  ): HubDisplayStatus {
    if (isActive && status === EntityStatus.ACTIVE) {
      return HubDisplayStatus.ENABLED;
    }
    if (!isActive && status === EntityStatus.DRAFT) {
      return HubDisplayStatus.SUSPENDED;
    }
    return HubDisplayStatus.DISABLED;
  }

  private buildOrderBy(
    sortBy?: HubSortField,
    sortOrder?: 'asc' | 'desc',
  ): Prisma.HubOrderByWithRelationInput {
    const order = sortOrder ?? 'desc';
    const field = sortBy ?? HubSortField.CREATED_AT;

    const allowed = new Set(Object.values(HubSortField));
    if (!allowed.has(field)) {
      return { createdAt: order };
    }

    return { [field]: order };
  }

  private mapHub(hub: {
    id: string;
    code: string;
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    pincode: string;
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    phone: string | null;
    email: string | null;
    capacity: number | null;
    workingHours: string | null;
    isActive: boolean;
    status: EntityStatus;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
  }) {
    return {
      id: hub.id,
      code: hub.code,
      name: hub.name,
      address: hub.addressLine1,
      addressLine1: hub.addressLine1,
      addressLine2: hub.addressLine2,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      latitude: Number(hub.latitude),
      longitude: Number(hub.longitude),
      phone: hub.phone,
      email: hub.email,
      capacity: hub.capacity,
      workingHours: hub.workingHours,
      isActive: hub.isActive,
      status: hub.status,
      operationalStatus: this.deriveOperationalStatus(hub.isActive, hub.status),
      createdAt: hub.createdAt,
      updatedAt: hub.updatedAt,
      deletedAt: hub.deletedAt ?? null,
    };
  }

  private mapHubListItem(hub: {
    id: string;
    code: string;
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
    phone: string | null;
    email: string | null;
    capacity: number | null;
    isActive: boolean;
    status: EntityStatus;
    createdAt: Date;
    users: {
      id: string;
      fullName: string;
      employeeId: string;
      email: string | null;
      phone: string | null;
    }[];
    _count: { orders: number; drivers: number; vehicles: number };
  }) {
    const manager = hub.users[0] ?? null;

    return {
      id: hub.id,
      code: hub.code,
      name: hub.name,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      phone: hub.phone,
      email: hub.email,
      capacity: hub.capacity,
      isActive: hub.isActive,
      status: hub.status,
      operationalStatus: this.deriveOperationalStatus(hub.isActive, hub.status),
      manager: manager
        ? {
            id: manager.id,
            name: manager.fullName,
            employeeId: manager.employeeId,
            email: manager.email,
            phone: manager.phone,
          }
        : null,
      orderCount: hub._count.orders,
      driverCount: hub._count.drivers,
      vehicleCount: hub._count.vehicles,
      createdAt: hub.createdAt,
    };
  }
}
