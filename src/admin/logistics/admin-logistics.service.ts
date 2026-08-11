import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, type Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { RUNNING_VEHICLE_STATUSES } from '../../modules/vehicles/vehicle-compliance.util';

type UiWarehouseStatus =
  | 'pending'
  | 'assigned'
  | 'loading'
  | 'dispatched'
  | 'in_transit'
  | 'reached_hub'
  | 'completed'
  | 'delayed';

type UiCustomerStatus =
  | 'packed'
  | 'assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'returned';

type UiPriority = 'low' | 'medium' | 'high' | 'critical';

type UiDispatchStatus =
  | 'pending'
  | 'assigned'
  | 'dispatched'
  | 'in_transit'
  | 'completed'
  | 'cancelled';

type UiMaintenanceStatus =
  | 'scheduled'
  | 'in_maintenance'
  | 'completed'
  | 'overdue';

type ShipmentIssue =
  | 'vehicle_breakdown'
  | 'traffic_delay'
  | 'driver_unreachable'
  | 'document_missing'
  | 'wrong_route'
  | 'none';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapPriority(priority?: string | null): UiPriority {
  switch ((priority ?? 'NORMAL').toUpperCase()) {
    case 'URGENT':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'LOW':
      return 'low';
    default:
      return 'medium';
  }
}

function mapWarehouseStatus(
  status: string,
  opts: {
    vehicleId?: string | null;
    driverId?: string | null;
    isDelayed?: boolean;
  },
): UiWarehouseStatus {
  if (opts.isDelayed && ['DISPATCHED', 'IN_TRANSIT'].includes(status)) {
    return 'delayed';
  }
  switch (status) {
    case 'ALLOCATED':
      if (opts.vehicleId && opts.driverId) return 'loading';
      if (opts.vehicleId || opts.driverId) return 'assigned';
      return 'pending';
    case 'DISPATCHED':
      return 'dispatched';
    case 'IN_TRANSIT':
      return 'in_transit';
    case 'RECEIVED':
      return 'reached_hub';
    case 'COMPLETED':
      return 'completed';
    default:
      return 'pending';
  }
}

function mapCustomerStatus(status: OrderStatus): UiCustomerStatus {
  switch (status) {
    case OrderStatus.PACKED:
    case OrderStatus.READY_FOR_DISPATCH:
      return 'packed';
    case OrderStatus.DRIVER_ASSIGNED:
      return 'assigned';
    case OrderStatus.OUT_FOR_DELIVERY:
    case OrderStatus.DISPATCHED:
      return 'out_for_delivery';
    case OrderStatus.DELIVERED:
      return 'delivered';
    case OrderStatus.CANCELLED:
      return 'cancelled';
    default:
      return 'packed';
  }
}

function mapDispatchStatus(status: OrderStatus): UiDispatchStatus {
  switch (status) {
    case OrderStatus.PACKED:
    case OrderStatus.READY_FOR_DISPATCH:
      return 'pending';
    case OrderStatus.DRIVER_ASSIGNED:
      return 'assigned';
    case OrderStatus.OUT_FOR_DELIVERY:
      return 'dispatched';
    case OrderStatus.DISPATCHED:
      return 'in_transit';
    case OrderStatus.DELIVERED:
      return 'completed';
    case OrderStatus.CANCELLED:
      return 'cancelled';
    default:
      return 'pending';
  }
}

function formatAddress(deliveryAddress: unknown): string {
  if (!deliveryAddress || typeof deliveryAddress !== 'object') return '—';
  const addr = deliveryAddress as Record<string, unknown>;
  const parts = [
    addr.line1,
    addr.line2,
    addr.addressLine1,
    addr.address,
    addr.landmark,
    addr.city,
    addr.pincode,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  return parts.length ? Array.from(new Set(parts)).join(', ') : '—';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function deriveIssue(params: {
  isDelayed: boolean;
  hasVehicle: boolean;
  hasDriver: boolean;
  vehicleStatus?: string | null;
}): ShipmentIssue {
  if (params.vehicleStatus === 'MAINTENANCE') return 'vehicle_breakdown';
  if (!params.hasVehicle || !params.hasDriver) return 'document_missing';
  if (params.isDelayed) return 'traffic_delay';
  return 'none';
}

@Injectable()
export class AdminLogisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const hubs = await this.prisma.hub.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        hubType: true,
        city: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      warehouses: hubs
        .filter((h) => h.hubType === 'CENTRAL_WAREHOUSE')
        .map((h) => ({ id: h.id, name: h.name, code: h.code })),
      hubs: hubs
        .filter((h) => h.hubType !== 'CENTRAL_WAREHOUSE')
        .map((h) => ({
          id: h.id,
          name: h.name,
          code: h.code,
          city: h.city,
        })),
    };
  }

  async getDashboard() {
    const today = startOfToday();
    const now = new Date();

    const [
      warehouseTransfers,
      hubDeliveries,
      vehiclesRunning,
      driversActive,
      delayedWarehouse,
      delayedCustomer,
      todaysDeliveries,
      warehouseHub,
      hubCustomer,
      criticalWarehouse,
      criticalCustomer,
    ] = await Promise.all([
      this.prisma.requisition.count({
        where: {
          status: {
            in: ['ALLOCATED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          hubId: { not: null },
          orderStatus: {
            in: [
              OrderStatus.PACKED,
              OrderStatus.READY_FOR_DISPATCH,
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
              OrderStatus.DELIVERED,
            ],
          },
          hub: { deletedAt: null, NOT: { hubType: 'CENTRAL_WAREHOUSE' } },
        },
      }),
      this.prisma.vehicle.count({
        where: {
          deletedAt: null,
          isActive: true,
          status: { in: RUNNING_VEHICLE_STATUSES },
        },
      }),
      this.prisma.driver.count({
        where: {
          deletedAt: null,
          isActive: true,
          availability: { in: ['ASSIGNED', 'ON_DELIVERY'] },
        },
      }),
      this.prisma.requisition.count({
        where: {
          status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
          estimatedArrival: { lt: now },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: {
            in: [
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
            ],
          },
          expectedDeliveryAt: { lt: now },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: today },
        },
      }),
      Promise.all([
        this.prisma.requisition.count({
          where: { status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
        }),
        this.prisma.requisition.count({
          where: { status: 'ALLOCATED' },
        }),
        this.prisma.requisition.count({
          where: {
            status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
            estimatedArrival: { lt: now },
          },
        }),
        this.prisma.requisition.count({
          where: { status: { in: ['RECEIVED', 'COMPLETED'] } },
        }),
      ]),
      Promise.all([
        this.prisma.order.count({
          where: {
            deletedAt: null,
            orderStatus: {
              in: [OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH],
            },
          },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            orderStatus: {
              in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DISPATCHED],
            },
          },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            orderStatus: OrderStatus.DELIVERED,
          },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            orderStatus: OrderStatus.CANCELLED,
            updatedAt: { gte: today },
          },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            orderStatus: OrderStatus.CANCELLED,
            // returned is not a separate status — surface 0 unless marked via remarks later
            id: { in: [] },
          },
        }),
      ]),
      this.prisma.requisition.findMany({
        where: {
          OR: [
            {
              status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
              estimatedArrival: { lt: now },
            },
            {
              status: 'ALLOCATED',
              OR: [{ vehicleId: null }, { driverId: null }],
            },
          ],
        },
        take: 25,
        orderBy: { updatedAt: 'desc' },
        include: {
          hub: { select: { id: true, name: true } },
          warehouseHub: { select: { id: true, name: true } },
          vehicle: { select: { id: true, registration: true, status: true } },
          driver: { select: { id: true, name: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            {
              orderStatus: {
                in: [
                  OrderStatus.DRIVER_ASSIGNED,
                  OrderStatus.OUT_FOR_DELIVERY,
                  OrderStatus.DISPATCHED,
                ],
              },
              expectedDeliveryAt: { lt: now },
            },
            {
              orderStatus: {
                in: [OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH],
              },
              assignedDriverId: null,
            },
          ],
        },
        take: 25,
        orderBy: { updatedAt: 'desc' },
        include: {
          customer: { select: { fullName: true } },
          hub: { select: { id: true, name: true } },
          assignedDriver: { select: { id: true, name: true } },
          assignedVehicle: {
            select: { id: true, registration: true, status: true },
          },
          dispatch: {
            include: {
              driver: { select: { id: true, name: true } },
              vehicle: {
                select: { id: true, registration: true, status: true },
              },
            },
          },
        },
      }),
    ]);

    const [
      whInTransit,
      whPending,
      whDelayed,
      whCompleted,
    ] = warehouseHub;
    const [ready, ofd, delivered, failed, returned] = hubCustomer;

    const criticalShipments = [
      ...criticalWarehouse.map((row) => {
        const isDelayed =
          !!row.estimatedArrival &&
          row.estimatedArrival.getTime() < now.getTime() &&
          ['DISPATCHED', 'IN_TRANSIT'].includes(row.status);
        const issue = deriveIssue({
          isDelayed,
          hasVehicle: Boolean(row.vehicleId ?? row.vehicle),
          hasDriver: Boolean(row.driverId ?? row.driver),
          vehicleStatus: row.vehicle?.status,
        });
        return {
          id: row.id,
          shipmentId: row.requestNo.replace(/^REQ-/, 'TRN-'),
          shipmentType: 'warehouse_transfer' as const,
          source: row.warehouseHub?.name ?? 'Central Warehouse',
          destination: row.hub.name,
          vehicleId: row.vehicleId ?? row.vehicle?.id ?? null,
          vehicleNumber:
            row.vehicleRegistration ?? row.vehicle?.registration ?? null,
          driverId: row.driverId ?? row.driver?.id ?? null,
          driverName: row.driverName ?? row.driver?.name ?? null,
          eta: row.estimatedArrival?.toISOString() ?? '',
          issue,
          priority: mapPriority(row.priority),
          status: mapWarehouseStatus(row.status, {
            vehicleId: row.vehicleId,
            driverId: row.driverId,
            isDelayed,
          }),
        };
      }),
      ...criticalCustomer.map((row) => {
        const driver = row.dispatch?.driver ?? row.assignedDriver;
        const vehicle = row.dispatch?.vehicle ?? row.assignedVehicle;
        const isDelayed =
          !!row.expectedDeliveryAt &&
          row.expectedDeliveryAt.getTime() < now.getTime() &&
          (
            [
              OrderStatus.DRIVER_ASSIGNED,
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
            ] as OrderStatus[]
          ).includes(row.orderStatus);
        const issue = deriveIssue({
          isDelayed,
          hasVehicle: Boolean(vehicle),
          hasDriver: Boolean(driver),
          vehicleStatus: vehicle?.status,
        });
        return {
          id: row.id,
          shipmentId: row.orderNumber,
          shipmentType: 'customer_delivery' as const,
          source: row.hub?.name ?? 'Hub',
          destination: row.customer?.fullName ?? 'Customer',
          vehicleId: vehicle?.id ?? null,
          vehicleNumber: vehicle?.registration ?? null,
          driverId: driver?.id ?? null,
          driverName: driver?.name ?? null,
          eta:
            row.dispatch?.estimatedEtaAt?.toISOString() ??
            row.expectedDeliveryAt?.toISOString() ??
            '',
          issue,
          priority: isDelayed ? ('high' as UiPriority) : ('medium' as UiPriority),
          status: mapCustomerStatus(row.orderStatus),
        };
      }),
    ]
      .sort((a, b) => {
        const aScore = a.issue === 'none' ? 0 : 1;
        const bScore = b.issue === 'none' ? 0 : 1;
        return bScore - aScore;
      })
      .slice(0, 50);

    return {
      warehouseTransfers,
      hubDeliveries,
      vehiclesRunning,
      driversActive,
      delayedShipments: delayedWarehouse + delayedCustomer,
      todaysDeliveries,
      warehouseHub: {
        inTransit: whInTransit,
        pendingDispatch: whPending,
        delayed: whDelayed,
        completed: whCompleted,
      },
      hubCustomer: {
        readyForDelivery: ready,
        outForDelivery: ofd,
        delivered,
        failedDelivery: failed,
        returned,
      },
      criticalShipments,
    };
  }

  async listWarehouse(query: {
    search?: string;
    warehouseId?: string;
    hubId?: string;
    destinationHubId?: string;
    priority?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const now = new Date();
    const today = startOfToday();
    const destinationHubId = query.destinationHubId || query.hubId;

    const where: Prisma.RequisitionWhereInput = {
      status: {
        in: ['ALLOCATED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'],
      },
      ...(destinationHubId ? { hubId: destinationHubId } : {}),
      ...(query.warehouseId ? { warehouseHubId: query.warehouseId } : {}),
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      const reqAlias = q.toUpperCase().startsWith('TRN-')
        ? `REQ-${q.slice(4)}`
        : q.toUpperCase().startsWith('WS-')
          ? q.replace(/^WS-/i, 'REQ-')
          : q;
      where.OR = [
        { requestNo: { contains: q, mode: 'insensitive' } },
        { requestNo: { contains: reqAlias, mode: 'insensitive' } },
        { vehicleRegistration: { contains: q, mode: 'insensitive' } },
        { driverName: { contains: q, mode: 'insensitive' } },
        { hub: { name: { contains: q, mode: 'insensitive' } } },
        { warehouseHub: { name: { contains: q, mode: 'insensitive' } } },
        {
          items: {
            some: { productName: { contains: q, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.priority && query.priority !== 'all') {
      const p = query.priority.toLowerCase();
      if (p === 'critical' || p === 'high') {
        where.priority = p === 'critical' ? 'URGENT' : 'HIGH';
      } else if (p === 'medium' || p === 'low') {
        where.priority = 'NORMAL';
      }
    }

    if (query.status && query.status !== 'all') {
      const s = query.status.toLowerCase();
      if (s === 'delayed') {
        where.status = { in: ['DISPATCHED', 'IN_TRANSIT'] };
        where.estimatedArrival = { lt: now };
      } else if (s === 'pending') {
        where.status = 'ALLOCATED';
        where.vehicleId = null;
        where.driverId = null;
      } else if (s === 'assigned') {
        where.status = 'ALLOCATED';
        where.OR = [
          { vehicleId: { not: null } },
          { driverId: { not: null } },
        ];
      } else if (s === 'loading') {
        where.status = 'ALLOCATED';
        where.vehicleId = { not: null };
        where.driverId = { not: null };
      } else if (s === 'dispatched') {
        where.status = 'DISPATCHED';
      } else if (s === 'in_transit') {
        where.status = { in: ['DISPATCHED', 'IN_TRANSIT'] };
      } else if (s === 'reached_hub') {
        where.status = 'RECEIVED';
      } else if (s === 'completed') {
        where.status = 'COMPLETED';
      }
    }

    const [rows, total, transfersToday, pending, loading, inTransit, delayed, completed] =
      await Promise.all([
        this.prisma.requisition.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            hub: { select: { id: true, name: true, code: true } },
            warehouseHub: { select: { id: true, name: true, code: true } },
            vehicle: {
              select: { id: true, registration: true, status: true },
            },
            driver: { select: { id: true, name: true, phone: true } },
          },
        }),
        this.prisma.requisition.count({ where }),
        this.prisma.requisition.count({
          where: {
            status: {
              in: ['DISPATCHED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'],
            },
            OR: [
              { dispatchedAt: { gte: today } },
              { allocatedAt: { gte: today } },
              { createdAt: { gte: today } },
            ],
          },
        }),
        this.prisma.requisition.count({
          where: {
            status: 'ALLOCATED',
            vehicleId: null,
            driverId: null,
          },
        }),
        this.prisma.requisition.count({
          where: {
            status: 'ALLOCATED',
            vehicleId: { not: null },
            driverId: { not: null },
          },
        }),
        this.prisma.requisition.count({
          where: { status: { in: ['DISPATCHED', 'IN_TRANSIT'] } },
        }),
        this.prisma.requisition.count({
          where: {
            status: { in: ['DISPATCHED', 'IN_TRANSIT'] },
            estimatedArrival: { lt: now },
          },
        }),
        this.prisma.requisition.count({
          where: { status: { in: ['RECEIVED', 'COMPLETED'] } },
        }),
      ]);

    const data = rows.map((row) => {
      const isDelayed =
        !!row.estimatedArrival &&
        row.estimatedArrival.getTime() < now.getTime() &&
        ['DISPATCHED', 'IN_TRANSIT'].includes(row.status);
      return {
        id: row.id,
        shipmentId: row.requestNo.replace(/^REQ-/, 'TRN-'),
        requestNo: row.requestNo,
        warehouseId: row.warehouseHub?.id ?? '',
        warehouse: row.warehouseHub?.name ?? 'Central Warehouse',
        destinationHubId: row.hub.id,
        destinationHub: row.hub.name,
        vehicleId: row.vehicleId ?? row.vehicle?.id ?? null,
        vehicleNumber:
          row.vehicleRegistration ?? row.vehicle?.registration ?? null,
        driverId: row.driverId ?? row.driver?.id ?? null,
        driverName: row.driverName ?? row.driver?.name ?? null,
        dispatchTime: row.dispatchedAt?.toISOString() ?? null,
        eta: row.estimatedArrival?.toISOString() ?? '',
        priority: mapPriority(row.priority),
        status: mapWarehouseStatus(row.status, {
          vehicleId: row.vehicleId,
          driverId: row.driverId,
          isDelayed,
        }),
        isDelayed,
        createdAt: (row.allocatedAt ?? row.createdAt).toISOString(),
      };
    });

    return {
      data,
      stats: {
        transfersToday,
        pending,
        loading,
        inTransit,
        delayed,
        completed,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listCustomer(query: {
    search?: string;
    hubId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      hubId: query.hubId ? query.hubId : { not: null },
      orderStatus: {
        in: [
          OrderStatus.PACKED,
          OrderStatus.READY_FOR_DISPATCH,
          OrderStatus.DRIVER_ASSIGNED,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DISPATCHED,
          OrderStatus.DELIVERED,
          OrderStatus.CANCELLED,
        ],
      },
      hub: {
        deletedAt: null,
        NOT: { hubType: 'CENTRAL_WAREHOUSE' },
      },
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { fullName: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q, mode: 'insensitive' } } },
        { hub: { name: { contains: q, mode: 'insensitive' } } },
        { dispatch: { dispatchNo: { contains: q, mode: 'insensitive' } } },
        { dispatch: { trackingNo: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (query.status && query.status !== 'all') {
      const s = query.status.toLowerCase();
      if (s === 'packed') {
        where.orderStatus = {
          in: [OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH],
        };
      } else if (s === 'assigned') {
        where.orderStatus = OrderStatus.DRIVER_ASSIGNED;
      } else if (s === 'out_for_delivery') {
        where.orderStatus = {
          in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DISPATCHED],
        };
      } else if (s === 'delivered') {
        where.orderStatus = OrderStatus.DELIVERED;
      } else if (s === 'cancelled' || s === 'failed') {
        where.orderStatus = OrderStatus.CANCELLED;
      } else if (s === 'returned') {
        where.id = { in: [] };
      }
    }

    const hubScope = query.hubId
      ? { hubId: query.hubId, deletedAt: null }
      : { hubId: { not: null }, deletedAt: null };

    const [rows, total, ordersReady, outForDelivery, delivered, failed, returned] =
      await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            customer: {
              select: { id: true, fullName: true, phone: true },
            },
            hub: { select: { id: true, name: true, code: true } },
            assignedDriver: { select: { id: true, name: true, phone: true } },
            assignedVehicle: {
              select: { id: true, registration: true },
            },
            dispatch: {
              include: {
                driver: { select: { id: true, name: true, phone: true } },
                vehicle: { select: { id: true, registration: true } },
              },
            },
          },
        }),
        this.prisma.order.count({ where }),
        this.prisma.order.count({
          where: {
            ...hubScope,
            orderStatus: {
              in: [OrderStatus.PACKED, OrderStatus.READY_FOR_DISPATCH],
            },
          },
        }),
        this.prisma.order.count({
          where: {
            ...hubScope,
            orderStatus: {
              in: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DISPATCHED],
            },
          },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: OrderStatus.CANCELLED },
        }),
        Promise.resolve(0),
      ]);

    const data = rows.map((row) => {
      const driver = row.dispatch?.driver ?? row.assignedDriver;
      const vehicle = row.dispatch?.vehicle ?? row.assignedVehicle;
      return {
        id: row.id,
        orderId: row.orderNumber,
        customer: row.customer?.fullName ?? 'Customer',
        customerPhone: row.customer?.phone ?? '',
        hubId: row.hub?.id ?? '',
        hub: row.hub?.name ?? '',
        vehicleId: vehicle?.id ?? null,
        vehicleNumber: vehicle?.registration ?? null,
        driverId: driver?.id ?? null,
        driverName: driver?.name ?? null,
        deliveryEta:
          row.dispatch?.estimatedEtaAt?.toISOString() ??
          row.expectedDeliveryAt?.toISOString() ??
          '',
        status: mapCustomerStatus(row.orderStatus),
        address: formatAddress(row.deliveryAddress),
        createdAt: row.createdAt.toISOString(),
      };
    });

    return {
      data,
      stats: {
        ordersReady,
        outForDelivery,
        delivered,
        failed,
        returned,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listDispatch(query: {
    search?: string;
    source?: string;
    status?: string;
    assignment?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const today = startOfToday();

    // Combine pending warehouse transfers + customer orders needing/having dispatch
    const warehouseWhere: Prisma.RequisitionWhereInput = {
      status: { in: ['ALLOCATED', 'DISPATCHED', 'IN_TRANSIT'] },
    };
    const orderWhere: Prisma.OrderWhereInput = {
      deletedAt: null,
      hubId: { not: null },
      orderStatus: {
        in: [
          OrderStatus.PACKED,
          OrderStatus.READY_FOR_DISPATCH,
          OrderStatus.DRIVER_ASSIGNED,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DISPATCHED,
        ],
      },
      hub: { deletedAt: null, NOT: { hubType: 'CENTRAL_WAREHOUSE' } },
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      warehouseWhere.OR = [
        { requestNo: { contains: q, mode: 'insensitive' } },
        { hub: { name: { contains: q, mode: 'insensitive' } } },
        { vehicleRegistration: { contains: q, mode: 'insensitive' } },
        { driverName: { contains: q, mode: 'insensitive' } },
      ];
      orderWhere.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { fullName: { contains: q, mode: 'insensitive' } } },
        { hub: { name: { contains: q, mode: 'insensitive' } } },
        { dispatch: { dispatchNo: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [warehouseRows, orderRows, driversWaiting, vehiclesWaiting, centralWarehouse] =
      await Promise.all([
        this.prisma.requisition.findMany({
          where: warehouseWhere,
          orderBy: { updatedAt: 'desc' },
          take: 200,
          include: {
            hub: { select: { id: true, name: true, hubType: true } },
            warehouseHub: { select: { id: true, name: true, hubType: true } },
            vehicle: { select: { id: true, registration: true } },
            driver: { select: { id: true, name: true } },
          },
        }),
        this.prisma.order.findMany({
          where: orderWhere,
          orderBy: { updatedAt: 'desc' },
          take: 200,
          include: {
            customer: { select: { fullName: true } },
            hub: { select: { id: true, name: true, hubType: true } },
            assignedDriver: { select: { id: true, name: true } },
            assignedVehicle: { select: { id: true, registration: true } },
            dispatch: {
              include: {
                driver: { select: { id: true, name: true } },
                vehicle: { select: { id: true, registration: true } },
              },
            },
          },
        }),
        this.prisma.driver.count({
          where: {
            deletedAt: null,
            isActive: true,
            availability: 'AVAILABLE',
          },
        }),
        this.prisma.vehicle.count({
          where: {
            deletedAt: null,
            isActive: true,
            status: 'AVAILABLE',
          },
        }),
        this.prisma.hub.findFirst({
          where: { hubType: 'CENTRAL_WAREHOUSE', isActive: true },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const centralName = centralWarehouse?.name ?? 'Central Warehouse';
    const centralId = centralWarehouse?.id ?? null;

    let records = [
      ...warehouseRows
        .filter((row) => {
          // Warehouse→Hub only. Never show same-hub (Hub→Hub) routes.
          const sourceId = row.warehouseHubId ?? centralId;
          const destId = row.hubId;
          if (!destId) return false;
          if (sourceId && destId && sourceId === destId) return false;
          // Destination must be a sub-hub, not the central warehouse itself.
          if (row.hub.hubType === 'CENTRAL_WAREHOUSE') return false;
          return true;
        })
        .map((row) => {
          const sourceName =
            row.warehouseHub?.hubType === 'CENTRAL_WAREHOUSE'
              ? row.warehouseHub.name
              : centralName;
          return {
            id: row.id,
            dispatchId: row.requestNo.replace(/^REQ-/, 'TRN-'),
            source: sourceName,
            destination: row.hub.name,
            vehicleId: row.vehicleId ?? row.vehicle?.id ?? null,
            vehicleNumber:
              row.vehicleRegistration ?? row.vehicle?.registration ?? null,
            driverId: row.driverId ?? row.driver?.id ?? null,
            driverName: row.driverName ?? row.driver?.name ?? null,
            route: `${sourceName} → ${row.hub.name}`,
            eta: row.estimatedArrival?.toISOString() ?? '',
            status: (row.status === 'ALLOCATED'
              ? row.vehicleId
                ? 'assigned'
                : 'pending'
              : row.status === 'IN_TRANSIT'
                ? 'in_transit'
                : 'dispatched') as UiDispatchStatus,
            createdAt: row.createdAt.toISOString(),
            kind: 'warehouse' as const,
          };
        }),
      ...orderRows
        .filter((row) => {
          // Hub→Customer only. Reject missing hub or central-warehouse-as-source misuse.
          if (!row.hubId || !row.hub) return false;
          if (row.hub.hubType === 'CENTRAL_WAREHOUSE') return false;
          const customerName = row.customer?.fullName?.trim() ?? '';
          // Block hub-to-same-hub style mislabels (destination equals source hub name).
          if (
            customerName &&
            customerName.toLowerCase() === row.hub.name.toLowerCase()
          ) {
            return false;
          }
          return true;
        })
        .map((row) => {
        const driver = row.dispatch?.driver ?? row.assignedDriver;
        const vehicle = row.dispatch?.vehicle ?? row.assignedVehicle;
        return {
          id: row.id,
          dispatchId:
            row.dispatch?.dispatchNo ?? `DSP-${row.orderNumber}`,
          source: row.hub?.name ?? 'Hub',
          destination: row.customer?.fullName ?? 'Customer',
          vehicleId: vehicle?.id ?? null,
          vehicleNumber: vehicle?.registration ?? null,
          driverId: driver?.id ?? null,
          driverName: driver?.name ?? null,
          route: `${row.hub?.name ?? 'Hub'} → ${row.customer?.fullName ?? 'Customer'}`,
          eta:
            row.dispatch?.estimatedEtaAt?.toISOString() ??
            row.expectedDeliveryAt?.toISOString() ??
            '',
          status: mapDispatchStatus(row.orderStatus),
          createdAt: row.createdAt.toISOString(),
          kind: 'customer' as const,
        };
      }),
    ];

    if (query.status && query.status !== 'all') {
      records = records.filter((r) => r.status === query.status);
    }
    if (query.assignment === 'needs_driver') {
      records = records.filter((r) => !r.driverId);
    } else if (query.assignment === 'needs_vehicle') {
      records = records.filter((r) => !r.vehicleId);
    }
    if (query.source && query.source !== 'all') {
      records = records.filter((r) =>
        r.source.toLowerCase().includes(query.source!.toLowerCase()),
      );
    }

    records.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = records.length;
    const data = records.slice(skip, skip + limit);
    const pending = records.filter((r) => r.status === 'pending').length;
    const todaysDispatches = records.filter(
      (r) => new Date(r.createdAt) >= today,
    ).length;

    return {
      data,
      stats: {
        pending,
        todaysDispatches,
        driversWaiting,
        vehiclesWaiting,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listMaintenance(query: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      OR: [
        { status: 'MAINTENANCE' },
        { maintenanceCompletedAt: { not: null } },
        {
          AND: [
            { maintenanceExpectedAt: { not: null } },
            { maintenanceStartedAt: null },
            { status: { not: 'MAINTENANCE' } },
          ],
        },
      ],
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { registration: { contains: q, mode: 'insensitive' } },
            { maintenanceReason: { contains: q, mode: 'insensitive' } },
            { remarks: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const rows = await this.prisma.vehicle.findMany({
      where,
      orderBy: [{ maintenanceExpectedAt: 'asc' }, { updatedAt: 'desc' }],
      include: {
        hub: { select: { name: true } },
      },
    });

    const mapped = rows.map((v) => {
      let status: UiMaintenanceStatus;
      if (v.status === 'MAINTENANCE') {
        status =
          v.maintenanceExpectedAt && v.maintenanceExpectedAt.getTime() < now.getTime()
            ? 'overdue'
            : 'in_maintenance';
      } else if (
        v.maintenanceExpectedAt &&
        !v.maintenanceStartedAt &&
        v.maintenanceExpectedAt.getTime() > now.getTime()
      ) {
        status = 'scheduled';
      } else if (v.maintenanceCompletedAt) {
        status = 'completed';
      } else {
        status = 'scheduled';
      }

      return {
        id: v.id,
        vehicleId: v.id,
        vehicleNumber: v.registration,
        issue: v.maintenanceReason?.trim() || 'General maintenance',
        garage: v.hub?.name ?? '—',
        expectedCompletion:
          v.maintenanceExpectedAt?.toISOString() ??
          v.maintenanceCompletedAt?.toISOString() ??
          '',
        status,
        scheduledDate:
          v.maintenanceStartedAt?.toISOString() ??
          v.updatedAt.toISOString(),
      };
    });

    const filtered =
      query.status && query.status !== 'all'
        ? mapped.filter((m) => m.status === query.status)
        : mapped;

    const stats = {
      scheduled: mapped.filter((m) => m.status === 'scheduled').length,
      inMaintenance: mapped.filter((m) => m.status === 'in_maintenance')
        .length,
      completed: mapped.filter((m) => m.status === 'completed').length,
      overdue: mapped.filter((m) => m.status === 'overdue').length,
    };

    const total = filtered.length;
    const data = filtered.slice(skip, skip + limit);

    return {
      data,
      stats,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async trackShipment(shipmentId: string) {
    const raw = decodeURIComponent(shipmentId).trim();
    if (!raw) throw new NotFoundException('Shipment not found');

    const candidates = new Set<string>([raw, raw.toUpperCase()]);
    const upper = raw.toUpperCase();
    if (upper.startsWith('TRN-')) {
      candidates.add(`REQ-${upper.slice(4)}`);
      candidates.add(`REQ-${raw.slice(4)}`);
    }
    if (upper.startsWith('REQ-')) {
      candidates.add(`TRN-${upper.slice(4)}`);
      candidates.add(`TRN-${raw.slice(4)}`);
    }
    if (upper.startsWith('WS-')) {
      candidates.add(`REQ-${upper.slice(3)}`);
      candidates.add(`TRN-${upper.slice(3)}`);
    }
    if (upper.startsWith('ALC-')) {
      candidates.add(`REQ-${upper.slice(4)}`);
      candidates.add(`TRN-${upper.slice(4)}`);
    }
    if (upper.startsWith('CD-')) {
      // legacy customer demo prefix → try as order number fragment
      candidates.add(upper.replace(/^CD-/, 'BJW-'));
    }

    const requestNos = Array.from(candidates);

    const requisitionWhere: Prisma.RequisitionWhereInput = {
      OR: [
        ...(isUuid(raw) ? [{ id: raw }] : []),
        ...requestNos.map((value) => ({
          requestNo: { equals: value, mode: 'insensitive' as const },
        })),
      ],
    };

    const requisition = await this.prisma.requisition.findFirst({
      where: requisitionWhere,
      include: {
        hub: { select: { name: true } },
        warehouseHub: { select: { name: true } },
        vehicle: { select: { registration: true } },
        driver: { select: { name: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (requisition) {
      const stages = this.buildWarehouseTimeline(requisition);
      const eta = requisition.estimatedArrival;
      const delayMinutes =
        eta &&
        ['DISPATCHED', 'IN_TRANSIT'].includes(requisition.status) &&
        eta.getTime() < Date.now()
          ? Math.round((Date.now() - eta.getTime()) / 60000)
          : 0;

      return {
        shipmentId: requisition.requestNo.replace(/^REQ-/, 'TRN-'),
        shipmentType: 'warehouse_transfer' as const,
        currentStage: stages.find((s) => s.isCurrent)?.stage ?? 'shipment_created',
        stages,
        vehicleNumber:
          requisition.vehicleRegistration ??
          requisition.vehicle?.registration ??
          null,
        driverName: requisition.driverName ?? requisition.driver?.name ?? null,
        source: requisition.warehouseHub?.name ?? 'Central Warehouse',
        destination: requisition.hub.name,
        eta: eta?.toISOString() ?? '',
        delayMinutes,
        remarks:
          delayMinutes > 0
            ? `ETA exceeded by ${delayMinutes} minutes.`
            : 'On schedule. No issues reported.',
        status: mapWarehouseStatus(requisition.status, {
          vehicleId: requisition.vehicleId,
          driverId: requisition.driverId,
          isDelayed: delayMinutes > 0,
        }),
      };
    }

    const orderWhere: Prisma.OrderWhereInput = {
      deletedAt: null,
      OR: [
        ...(isUuid(raw) ? [{ id: raw }] : []),
        { orderNumber: { equals: raw, mode: 'insensitive' } },
        { orderNumber: { equals: upper, mode: 'insensitive' } },
        {
          dispatch: {
            dispatchNo: { equals: raw, mode: 'insensitive' },
          },
        },
        {
          dispatch: {
            dispatchNo: { equals: upper, mode: 'insensitive' },
          },
        },
        {
          dispatch: {
            trackingNo: { equals: raw, mode: 'insensitive' },
          },
        },
        {
          dispatch: {
            trackingNo: { equals: upper, mode: 'insensitive' },
          },
        },
      ],
    };

    const order = await this.prisma.order.findFirst({
      where: orderWhere,
      include: {
        customer: { select: { fullName: true } },
        hub: { select: { name: true } },
        assignedDriver: { select: { name: true } },
        assignedVehicle: { select: { registration: true } },
        dispatch: {
          include: {
            driver: { select: { name: true } },
            vehicle: { select: { registration: true } },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Shipment not found for ID "${raw}". Try TRN-/REQ- for warehouse transfers or BJW-/DSP- for customer deliveries.`,
      );
    }

    const stages = this.buildCustomerTimeline(order);
    const eta =
      order.dispatch?.estimatedEtaAt ?? order.expectedDeliveryAt ?? null;
    const delayMinutes =
      eta &&
      (
        [
          OrderStatus.DRIVER_ASSIGNED,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DISPATCHED,
        ] as OrderStatus[]
      ).includes(order.orderStatus) &&
      eta.getTime() < Date.now()
        ? Math.round((Date.now() - eta.getTime()) / 60000)
        : 0;

    const driver = order.dispatch?.driver ?? order.assignedDriver;
    const vehicle = order.dispatch?.vehicle ?? order.assignedVehicle;

    return {
      shipmentId: order.orderNumber,
      shipmentType: 'customer_delivery' as const,
      currentStage: stages.find((s) => s.isCurrent)?.stage ?? 'shipment_created',
      stages,
      vehicleNumber: vehicle?.registration ?? null,
      driverName: driver?.name ?? null,
      source: order.hub?.name ?? 'Hub',
      destination: order.customer?.fullName ?? 'Customer',
      eta: eta?.toISOString() ?? '',
      delayMinutes,
      remarks:
        delayMinutes > 0
          ? `ETA exceeded by ${delayMinutes} minutes.`
          : order.orderStatus === OrderStatus.DELIVERED
            ? 'Delivered successfully.'
            : 'On schedule. No issues reported.',
      status: mapCustomerStatus(order.orderStatus),
    };
  }

  private buildWarehouseTimeline(row: {
    status: string;
    createdAt: Date;
    allocatedAt: Date | null;
    vehicleId: string | null;
    driverId: string | null;
    dispatchedAt: Date | null;
    receivedAt: Date | null;
    completedAt: Date | null;
    timeline: Array<{
      title: string;
      createdAt: Date;
      subtitle: string | null;
    }>;
  }) {
    const byTitle = (needle: string) =>
      row.timeline.find((t) =>
        t.title.toLowerCase().includes(needle.toLowerCase()),
      )?.createdAt ?? null;

    const stages = [
      {
        stage: 'shipment_created' as const,
        label: 'Shipment Created',
        completedAt: (row.allocatedAt ?? row.createdAt).toISOString(),
      },
      {
        stage: 'vehicle_assigned' as const,
        label: 'Vehicle Assigned',
        completedAt: row.vehicleId
          ? (byTitle('vehicle') ?? row.allocatedAt ?? row.createdAt).toISOString()
          : null,
      },
      {
        stage: 'driver_assigned' as const,
        label: 'Driver Assigned',
        completedAt: row.driverId
          ? (byTitle('driver') ?? row.allocatedAt ?? row.createdAt).toISOString()
          : null,
      },
      {
        stage: 'loading' as const,
        label: 'Loading',
        completedAt:
          row.vehicleId && row.driverId
            ? (byTitle('load') ?? row.dispatchedAt)?.toISOString() ??
              (row.dispatchedAt ? row.dispatchedAt.toISOString() : null)
            : null,
      },
      {
        stage: 'dispatched' as const,
        label: 'Dispatched',
        completedAt: row.dispatchedAt?.toISOString() ?? null,
      },
      {
        stage: 'checkpoint' as const,
        label: 'In Transit',
        completedAt:
          ['IN_TRANSIT', 'RECEIVED', 'COMPLETED'].includes(row.status)
            ? (row.dispatchedAt ?? byTitle('transit'))?.toISOString() ?? null
            : null,
      },
      {
        stage: 'reached_hub' as const,
        label: 'Arrived at Hub',
        completedAt: row.receivedAt?.toISOString() ?? null,
      },
      {
        stage: 'completed' as const,
        label: 'Received',
        completedAt:
          row.completedAt?.toISOString() ??
          (row.status === 'COMPLETED' ? row.receivedAt?.toISOString() ?? null : null),
      },
    ];

    let currentIdx = stages.findIndex((s) => !s.completedAt);
    // When every stage is complete, do not keep the last stage as "current"
    // so the UI can show a green check on Delivered/Received.
    if (currentIdx < 0) {
      return stages.map((s) => ({ ...s, isCurrent: false }));
    }

    return stages.map((s, i) => ({
      ...s,
      isCurrent: i === currentIdx,
    }));
  }

  private buildCustomerTimeline(order: {
    orderStatus: OrderStatus;
    createdAt: Date;
    dispatchedAt: Date | null;
    deliveredAt: Date | null;
    timeline: Array<{ status: OrderStatus; createdAt: Date; message: string | null }>;
    dispatch: { dispatchedAt: Date | null; completedAt: Date | null } | null;
  }) {
    const findStatus = (status: OrderStatus) =>
      order.timeline.find((t) => t.status === status)?.createdAt ?? null;

    const stages = [
      {
        stage: 'shipment_created' as const,
        label: 'Order Ready',
        completedAt: (
          findStatus(OrderStatus.READY_FOR_DISPATCH) ??
          findStatus(OrderStatus.PACKED) ??
          order.createdAt
        ).toISOString(),
      },
      {
        stage: 'driver_assigned' as const,
        label: 'Driver Assigned',
        completedAt:
          findStatus(OrderStatus.DRIVER_ASSIGNED)?.toISOString() ?? null,
      },
      {
        stage: 'dispatched' as const,
        label: 'Dispatched',
        completedAt:
          (
            order.dispatch?.dispatchedAt ??
            order.dispatchedAt ??
            findStatus(OrderStatus.OUT_FOR_DELIVERY) ??
            findStatus(OrderStatus.DISPATCHED)
          )?.toISOString() ?? null,
      },
      {
        stage: 'checkpoint' as const,
        label: 'Out for Delivery',
        completedAt:
          (
            [
              OrderStatus.OUT_FOR_DELIVERY,
              OrderStatus.DISPATCHED,
              OrderStatus.DELIVERED,
            ] as OrderStatus[]
          ).includes(order.orderStatus)
            ? (
                order.dispatch?.dispatchedAt ??
                order.dispatchedAt ??
                findStatus(OrderStatus.OUT_FOR_DELIVERY)
              )?.toISOString() ?? null
            : null,
      },
      {
        stage: 'reached_hub' as const,
        label: 'Reached Customer',
        completedAt:
          order.orderStatus === OrderStatus.DELIVERED
            ? order.deliveredAt?.toISOString() ?? null
            : null,
      },
      {
        stage: 'completed' as const,
        label: 'Delivered',
        completedAt: order.deliveredAt?.toISOString() ?? null,
      },
    ];

    let currentIdx = stages.findIndex((s) => !s.completedAt);
    if (currentIdx < 0) {
      return stages.map((s) => ({ ...s, isCurrent: false }));
    }

    return stages.map((s, i) => ({
      ...s,
      isCurrent: i === currentIdx,
    }));
  }
}
