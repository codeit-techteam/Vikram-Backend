import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  HubOperationStatus,
  OrderStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { getOrderStatusLabel } from '../../modules/orders/order-lifecycle.constants';
import { OrderEventsService } from '../../modules/orders/order-events.service';
import {
  evaluateVehicleCompliance,
  RUNNING_VEHICLE_STATUSES,
} from '../../modules/vehicles/vehicle-compliance.util';
import { generateDispatchNo } from '../common/hub-date.util';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubDispatchCreateDto,
  HubDispatchLiveQueryDto,
  HubDispatchQueryDto,
  HubDispatchUpdateDto,
  HubOrderActionDto,
  HubVerifyDeliveryOtpDto,
} from '../dto/hub.dto';
import { HubOrdersService } from '../orders/hub-orders.service';

/** Estimate order weight in tons from line items (kg → tons, ton/t as-is). */
function estimateOrderWeightTons(
  items: Array<{ quantity: number; unit: string }>,
): number | null {
  if (!items?.length) return null;
  let tons = 0;
  let hasWeight = false;
  for (const item of items) {
    const unit = (item.unit || '').toLowerCase().trim();
    const qty = Number(item.quantity) || 0;
    if (
      unit === 'kg' ||
      unit === 'kgs' ||
      unit === 'kilogram' ||
      unit === 'kilograms'
    ) {
      tons += qty / 1000;
      hasWeight = true;
    } else if (
      unit === 't' ||
      unit === 'ton' ||
      unit === 'tons' ||
      unit === 'tonne' ||
      unit === 'tonnes' ||
      unit === 'mt'
    ) {
      tons += qty;
      hasWeight = true;
    }
  }
  return hasWeight ? tons : null;
}

const PENDING_DISPATCH_STATUSES: OrderStatus[] = [
  'PACKED',
  'READY_FOR_DISPATCH',
];

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'DRIVER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DISPATCHED',
];

function generateTrackingNo(): string {
  return `TRK-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

function formatEtaMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function addressLine(deliveryAddress: unknown): string {
  if (!deliveryAddress || typeof deliveryAddress !== 'object') return '—';
  const addr = deliveryAddress as Record<string, unknown>;
  const parts = [addr.line1, addr.line2, addr.city, addr.pincode]
    .filter((v) => typeof v === 'string' && v.trim())
    .map(String);
  return parts.join(', ') || '—';
}

function mapQueueUiStatus(
  dispatchStatus: string,
  orderStatus: OrderStatus,
): 'pending' | 'loading' | 'dispatch' | 'delivered' | 'cancelled' | 'delay' {
  if (dispatchStatus === 'CANCELLED' || orderStatus === 'CANCELLED')
    return 'cancelled';
  if (dispatchStatus === 'COMPLETED' || orderStatus === 'DELIVERED')
    return 'delivered';
  if (orderStatus === 'OUT_FOR_DELIVERY' || orderStatus === 'DISPATCHED')
    return 'dispatch';
  if (orderStatus === 'DRIVER_ASSIGNED' || dispatchStatus === 'IN_PROGRESS')
    return 'loading';
  return 'pending';
}

function formatSlotLabel(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
}

@Injectable()
export class HubDispatchService {
  private readonly logger = new Logger(HubDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
    private readonly orderEvents: OrderEventsService,
    private readonly ordersService: HubOrdersService,
  ) {}

  async findAll(hubId: string, query: HubDispatchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.HubDispatchWhereInput = { hubId };
    if (query.status) {
      where.status = query.status as HubOperationStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.hubDispatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStatus: true,
              deliveryAddress: true,
              grandTotal: true,
              paymentMethod: true,
              paymentStatus: true,
              expectedDeliveryAt: true,
              customer: { select: { id: true, fullName: true, phone: true } },
            },
          },
          driver: true,
          vehicle: true,
        },
      }),
      this.prisma.hubDispatch.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Orders assigned to hub, ready for dispatch, not already dispatched. */
  async getPendingOrders(hubId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        hubId,
        deletedAt: null,
        orderStatus: { in: PENDING_DISPATCH_STATUSES },
        OR: [
          { dispatch: null },
          { dispatch: { status: { in: ['PENDING', 'CANCELLED'] } } },
        ],
        NOT: {
          orderStatus: {
            in: ['OUT_FOR_DELIVERY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
          },
        },
      },
      orderBy: [
        { isEmergency: 'desc' },
        { priorityOrder: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            subtotal: true,
          },
        },
        hub: { select: { id: true, name: true } },
      },
    });

    return orders.map((order) => {
      const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
      const weightEstimate = totalQty; // tons proxy from quantity until weight field exists
      const priority = order.isEmergency
        ? 'urgent'
        : order.priorityOrder
          ? 'high'
          : 'normal';
      const location = addressLine(order.deliveryAddress);
      const eta = order.expectedDeliveryAt
        ? formatEtaMinutes(
            Math.max(
              15,
              Math.round(
                (order.expectedDeliveryAt.getTime() - Date.now()) / 60000,
              ),
            ),
          )
        : '45 min';

      return {
        id: order.id,
        orderNo: order.orderNumber,
        orderNumber: order.orderNumber,
        label: `${order.orderNumber} — ${order.customer.fullName}`,
        customer: order.customer.fullName,
        customerPhone: order.customer.phone,
        location,
        address: location,
        priority,
        weight: `${weightEstimate} units`,
        weightValue: weightEstimate,
        eta,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderValue: Number(order.grandTotal),
        items: order.items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
        })),
        itemCount: order.items.length,
        totalQuantity: totalQty,
        materials: order.items
          .map((i) => `${i.name} ×${i.quantity}`)
          .join(', '),
        isEmergency: order.isEmergency,
        priorityOrder: order.priorityOrder,
        hubId: order.hubId,
        hubName: order.hub?.name ?? null,
        createdAt: order.createdAt,
      };
    });
  }

  /** Vehicles available at hub (not in transit / maintenance). */
  async getAvailableFleet(hubId: string) {
    const hub = await this.prisma.hub.findUnique({
      where: { id: hubId },
      select: { id: true, name: true },
    });

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        hubId,
        isActive: true,
        deletedAt: null,
        status: 'AVAILABLE',
      },
      orderBy: { registration: 'asc' },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            availability: true,
          },
        },
      },
    });

    // Exclude vehicles tied to active dispatches
    const busyVehicleIds = await this.prisma.hubDispatch.findMany({
      where: {
        hubId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        vehicleId: { not: null },
      },
      select: { vehicleId: true },
    });
    const busy = new Set(
      busyVehicleIds.map((d) => d.vehicleId).filter(Boolean),
    );

    return vehicles
      .filter((v) => !busy.has(v.id))
      .filter((v) => evaluateVehicleCompliance(v).isCompliant)
      .map((v) => {
        const capacity = Number(v.capacity);
        const compliance = evaluateVehicleCompliance(v);
        return {
          id: v.id,
          registrationNo: v.registration,
          vehicleNumber: v.registration,
          capacity: `${capacity} T`,
          capacityValue: capacity,
          remainingCapacity: capacity,
          remainingCapacityLabel: `${capacity} T`,
          vehicleType: v.vehicleType,
          type: v.vehicleType,
          status: 'available' as const,
          availability: 'AVAILABLE',
          currentDriver: v.driver?.name ?? null,
          currentDriverId: v.driver?.id ?? null,
          currentHub: hub?.name ?? null,
          hubId,
          rating: null,
          compliance,
          insuranceExpiry: v.insuranceExpiry,
          fitnessExpiry: v.fitnessExpiry,
        };
      });
  }

  /** Drivers available / online at hub (not on delivery). */
  async getAvailableDrivers(hubId: string) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        hubId,
        isActive: true,
        deletedAt: null,
        availability: 'AVAILABLE',
      },
      orderBy: { name: 'asc' },
      include: {
        vehicle: {
          select: { id: true, registration: true, vehicleType: true },
        },
        _count: {
          select: {
            orders: {
              where: { orderStatus: { in: ACTIVE_ORDER_STATUSES } },
            },
          },
        },
      },
    });

    const busyDriverIds = await this.prisma.hubDispatch.findMany({
      where: {
        hubId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        driverId: { not: null },
      },
      select: { driverId: true },
    });
    const busy = new Set(busyDriverIds.map((d) => d.driverId).filter(Boolean));

    return drivers
      .filter((d) => !busy.has(d.id) && d._count.orders === 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        mobile: d.phone,
        rating: 4.8,
        currentDeliveries: d._count.orders,
        experience: '—',
        assignedVehicle: d.vehicle?.registration ?? null,
        assignedVehicleId: d.vehicle?.id ?? null,
        status: 'available' as const,
        availability: 'AVAILABLE',
        online: true,
      }));
  }

  /** Delivery slots based on current time, workload, and availability. */
  async getDeliverySlots(hubId: string) {
    const now = new Date();
    const availableDrivers = await this.getAvailableDrivers(hubId);
    const availableVehicles = await this.getAvailableFleet(hubId);
    const workload = await this.prisma.hubDispatch.count({
      where: { hubId, status: 'IN_PROGRESS' },
    });

    if (availableDrivers.length === 0 || availableVehicles.length === 0) {
      return [];
    }

    const baseTravelMin = 30 + Math.min(30, workload * 5);
    const slots: Array<{
      id: string;
      label: string;
      value: string;
      startAt: string;
      estimatedEtaAt: string;
      travelMinutes: number;
      available: boolean;
    }> = [];

    // Round up to next 30-min boundary
    const start = new Date(now);
    start.setSeconds(0, 0);
    const mins = start.getMinutes();
    start.setMinutes(mins <= 30 ? 30 : 60);
    if (start.getMinutes() === 60) {
      start.setHours(start.getHours() + 1);
      start.setMinutes(0);
    }

    for (let i = 0; i < 8; i++) {
      const slotStart = new Date(start.getTime() + i * 30 * 60_000);
      const etaAt = new Date(slotStart.getTime() + baseTravelMin * 60_000);
      const label = formatSlotLabel(slotStart);
      slots.push({
        id: `slot-${slotStart.toISOString()}`,
        label,
        value: label,
        startAt: slotStart.toISOString(),
        estimatedEtaAt: etaAt.toISOString(),
        travelMinutes: baseTravelMin,
        available: true,
      });
    }

    return slots;
  }

  async getFleetStats(hubId: string) {
    const [
      total,
      available,
      inUse,
      maintenance,
      idle,
      activeDispatches,
      pendingOrders,
    ] = await Promise.all([
      this.prisma.vehicle.count({
        where: { hubId, isActive: true, deletedAt: null },
      }),
      this.prisma.vehicle.count({
        where: { hubId, isActive: true, deletedAt: null, status: 'AVAILABLE' },
      }),
      this.prisma.vehicle.count({
        where: {
          hubId,
          isActive: true,
          deletedAt: null,
          status: { in: [...RUNNING_VEHICLE_STATUSES] },
        },
      }),
      this.prisma.vehicle.count({
        where: {
          hubId,
          isActive: true,
          deletedAt: null,
          status: 'MAINTENANCE',
        },
      }),
      this.prisma.vehicle.count({
        where: {
          hubId,
          isActive: true,
          deletedAt: null,
          status: 'AVAILABLE',
          driver: null,
        },
      }),
      this.prisma.hubDispatch.count({
        where: { hubId, status: 'IN_PROGRESS' },
      }),
      this.prisma.order.count({
        where: {
          hubId,
          deletedAt: null,
          orderStatus: { in: PENDING_DISPATCH_STATUSES },
        },
      }),
    ]);

    const capacityAgg = await this.prisma.vehicle.aggregate({
      where: { hubId, isActive: true, deletedAt: null },
      _sum: { capacity: true },
    });
    const usedCapacityAgg = await this.prisma.vehicle.aggregate({
      where: {
        hubId,
        isActive: true,
        deletedAt: null,
        status: { in: [...RUNNING_VEHICLE_STATUSES] },
      },
      _sum: { capacity: true },
    });

    const totalCap = Number(capacityAgg._sum.capacity ?? 0);
    const usedCap = Number(usedCapacityAgg._sum.capacity ?? 0);
    const utilization =
      totalCap > 0 ? Math.round((usedCap / totalCap) * 100) : 0;

    // Average delivery time from completed dispatches (last 50)
    const completed = await this.prisma.hubDispatch.findMany({
      where: {
        hubId,
        status: 'COMPLETED',
        dispatchedAt: { not: null },
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
      select: { dispatchedAt: true, completedAt: true },
    });

    let avgMinutes = 0;
    if (completed.length > 0) {
      const totalMin = completed.reduce((sum, d) => {
        if (!d.dispatchedAt || !d.completedAt) return sum;
        return (
          sum + (d.completedAt.getTime() - d.dispatchedAt.getTime()) / 60_000
        );
      }, 0);
      avgMinutes = Math.round(totalMin / completed.length);
    }

    return {
      activeFleet: {
        current: inUse,
        total,
        changePercent: total > 0 ? Math.round((available / total) * 100) : 0,
      },
      avgHubExit: {
        minutes: avgMinutes || 14,
        status: avgMinutes > 0 && avgMinutes <= 45 ? 'Optimal' : 'Monitor',
      },
      activeTransits: activeDispatches,
      pendingLoadTons: pendingOrders,
      availableVehicles: available,
      busyVehicles: inUse,
      maintenance,
      idle,
      averageDeliveryTimeMinutes: avgMinutes,
      capacityUtilization: utilization,
      totalCapacity: totalCap,
      usedCapacity: usedCap,
    };
  }

  async getLiveQueue(hubId: string, query: HubDispatchLiveQueryDto) {
    const tab = (query.tab ?? 'all').toLowerCase();
    const search = query.search?.trim().toLowerCase();
    const sortBy = query.sortBy ?? 'eta';

    const dispatches = await this.prisma.hubDispatch.findMany({
      where: { hubId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        vehicle: {
          select: { id: true, registration: true, vehicleType: true },
        },
        order: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            items: { select: { id: true, quantity: true } },
            timeline: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                status: true,
                message: true,
                remarks: true,
                createdAt: true,
                updatedBy: true,
              },
            },
          },
        },
      },
    });

    let mapped = dispatches.map((d) => {
      const uiStatus = mapQueueUiStatus(d.status, d.order.orderStatus);
      const etaMinutes = d.estimatedEtaAt
        ? Math.max(
            5,
            Math.round((d.estimatedEtaAt.getTime() - Date.now()) / 60_000),
          )
        : d.order.expectedDeliveryAt
          ? Math.max(
              5,
              Math.round(
                (d.order.expectedDeliveryAt.getTime() - Date.now()) / 60_000,
              ),
            )
          : 45;
      const priority = d.order.isEmergency
        ? ('urgent' as const)
        : d.order.priorityOrder
          ? ('high' as const)
          : ('normal' as const);
      const location = addressLine(d.order.deliveryAddress);
      const slot =
        d.deliverySlot ??
        (d.dispatchedAt ? formatSlotLabel(d.dispatchedAt) : '—');
      const customerName = d.order.customer?.fullName ?? 'Customer';
      const customerPhone = d.order.customer?.phone ?? undefined;

      const timeline = d.order.timeline.map((t, idx) => {
        const isLast = idx === d.order.timeline.length - 1;
        return {
          id: t.id,
          title: t.message ?? t.remarks ?? getOrderStatusLabel(t.status),
          timestamp: t.createdAt.toISOString(),
          status: isLast ? ('active' as const) : ('completed' as const),
          description: t.remarks ?? undefined,
        };
      });

      return {
        id: d.id,
        dispatchNo: d.dispatchNo,
        trackingNo: d.trackingNo,
        orderNo: d.order.orderNumber,
        orderId: d.order.id,
        status: uiStatus,
        backendStatus: d.status,
        orderStatus: d.order.orderStatus,
        customer: customerName,
        customerDetails: {
          name: customerName,
          phone: customerPhone,
          address: location,
        },
        schedule: slot,
        scheduledTime: slot,
        vehicle: d.vehicle?.registration ?? '—',
        vehicleId: d.vehicle?.id ?? null,
        driver: d.driver?.name ?? '—',
        driverId: d.driver?.id ?? null,
        route: location,
        eta: formatEtaMinutes(etaMinutes),
        etaMinutes,
        priority,
        remarks: d.remarks ?? undefined,
        items: d.order.items.length,
        paymentMethod: d.order.paymentMethod,
        paymentStatus: d.order.paymentStatus,
        address: location,
        timeline,
        documents: [
          { id: `doc-${d.id}`, name: 'Delivery Challan', type: 'PDF' },
        ],
        dispatchDate: (d.dispatchedAt ?? d.createdAt)
          .toISOString()
          .split('T')[0],
        dispatchedAt: d.dispatchedAt,
        estimatedEtaAt: d.estimatedEtaAt,
        trackingProgress: uiStatus,
      };
    });

    if (tab && tab !== 'all') {
      mapped = mapped.filter((d) => {
        if (tab === 'dispatched' || tab === 'out_for_delivery')
          return d.status === 'dispatch';
        if (tab === 'delay') {
          return d.status === 'dispatch' && d.etaMinutes > 90;
        }
        return d.status === tab;
      });
    }

    if (search) {
      mapped = mapped.filter(
        (d) =>
          d.orderNo.toLowerCase().includes(search) ||
          d.customer.toLowerCase().includes(search) ||
          d.vehicle.toLowerCase().includes(search) ||
          d.driver.toLowerCase().includes(search) ||
          d.dispatchNo.toLowerCase().includes(search),
      );
    }

    mapped.sort((a, b) => {
      switch (sortBy) {
        case 'priority': {
          const weight = { urgent: 3, high: 2, normal: 1 };
          return weight[b.priority] - weight[a.priority];
        }
        case 'driver':
          return a.driver.localeCompare(b.driver);
        case 'vehicle':
          return a.vehicle.localeCompare(b.vehicle);
        case 'eta':
        default:
          return a.etaMinutes - b.etaMinutes;
      }
    });

    return mapped;
  }

  async getById(hubId: string, id: string) {
    const dispatch = await this.prisma.hubDispatch.findFirst({
      where: {
        hubId,
        OR: [{ id }, { dispatchNo: id }, { trackingNo: id }],
      },
      include: {
        driver: true,
        vehicle: true,
        order: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
            items: true,
            timeline: { orderBy: { createdAt: 'asc' } },
            assignedDriver: true,
            assignedVehicle: true,
            proofOfDelivery: true,
          },
        },
      },
    });

    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const queue = await this.getLiveQueue(hubId, { tab: 'all' });
    const card = queue.find((q) => q.id === dispatch.id);
    return {
      ...dispatch,
      ...card,
      orderDetail: dispatch.order,
    };
  }

  /**
   * Production dispatch planning: assign vehicle + driver + slot,
   * lock resources, create dispatch, mark OUT_FOR_DELIVERY — single transaction.
   */
  async planAndDispatch(
    hubId: string,
    dto: HubDispatchCreateDto,
    updatedBy: string,
  ) {
    if (dto.hubId && dto.hubId !== hubId) {
      throw new BadRequestException('Hub mismatch');
    }
    if (!dto.driverId || !dto.vehicleId) {
      throw new BadRequestException('driverId and vehicleId are required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: dto.orderId, hubId, deletedAt: null },
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          items: true,
          dispatch: true,
        },
      });
      if (!order) throw new NotFoundException('Order not found for this hub');

      const status = order.orderStatus;
      if (
        status === 'OUT_FOR_DELIVERY' ||
        status === 'DISPATCHED' ||
        status === 'DELIVERED' ||
        status === 'CANCELLED'
      ) {
        throw new ConflictException(`Order already ${status}`);
      }
      if (
        !PENDING_DISPATCH_STATUSES.includes(status) &&
        status !== 'DRIVER_ASSIGNED' &&
        status !== 'PICKING' &&
        status !== 'ACCEPTED_BY_HUB' &&
        status !== 'PROCESSING'
      ) {
        throw new BadRequestException(
          `Order status ${status} is not ready for dispatch planning`,
        );
      }
      if (order.dispatch && order.dispatch.status === 'IN_PROGRESS') {
        throw new ConflictException('Order already has an active dispatch');
      }

      const driver = await tx.driver.findFirst({
        where: {
          id: dto.driverId,
          hubId,
          isActive: true,
          deletedAt: null,
        },
      });
      if (!driver)
        throw new BadRequestException('Driver not found at this hub');
      if (driver.availability !== 'AVAILABLE') {
        throw new ConflictException('Driver is not available');
      }

      const vehicle = await tx.vehicle.findFirst({
        where: {
          id: dto.vehicleId,
          hubId,
          isActive: true,
          deletedAt: null,
        },
      });
      if (!vehicle)
        throw new BadRequestException('Vehicle not found at this hub');
      if (vehicle.status !== 'AVAILABLE') {
        throw new ConflictException(
          vehicle.status === 'OUT_FOR_DELIVERY'
            ? 'Vehicle is currently out for delivery.'
            : 'Vehicle is not available.',
        );
      }

      const compliance = evaluateVehicleCompliance(vehicle);
      if (!compliance.isCompliant) {
        throw new ConflictException(compliance.blockReasons[0]);
      }

      const orderWeightTons = estimateOrderWeightTons(order.items ?? []);
      if (orderWeightTons != null && orderWeightTons > 0) {
        const capacity = Number(vehicle.capacity ?? 0);
        if (capacity > 0 && orderWeightTons > capacity) {
          throw new BadRequestException(
            'Vehicle capacity is insufficient for this order.',
          );
        }
      }

      const activeDriverDispatch = await tx.hubDispatch.findFirst({
        where: {
          driverId: dto.driverId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          NOT: { orderId: dto.orderId },
        },
      });
      if (activeDriverDispatch) {
        throw new ConflictException('Driver already has an active dispatch');
      }

      const activeVehicleDispatch = await tx.hubDispatch.findFirst({
        where: {
          vehicleId: dto.vehicleId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          NOT: { orderId: dto.orderId },
        },
      });
      if (activeVehicleDispatch) {
        throw new ConflictException('Vehicle already has an active dispatch');
      }

      const now = new Date();
      let estimatedEtaAt: Date | null = null;
      if (dto.estimatedEta) {
        const parsed = new Date(dto.estimatedEta);
        if (!Number.isNaN(parsed.getTime())) estimatedEtaAt = parsed;
      }
      if (!estimatedEtaAt && dto.deliverySlot) {
        // Parse "02:30 PM" relative to today
        const match = dto.deliverySlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const period = match[3].toUpperCase();
          if (period === 'PM' && h < 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          estimatedEtaAt = new Date(now);
          estimatedEtaAt.setHours(h, m, 0, 0);
          // Add travel buffer
          estimatedEtaAt = new Date(estimatedEtaAt.getTime() + 45 * 60_000);
        }
      }
      if (!estimatedEtaAt) {
        estimatedEtaAt = new Date(now.getTime() + 45 * 60_000);
      }

      const dispatchNo = generateDispatchNo();
      const trackingNo = generateTrackingNo();

      const dispatch = await tx.hubDispatch.upsert({
        where: { orderId: dto.orderId },
        update: {
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          remarks: dto.remarks,
          status: 'IN_PROGRESS',
          dispatchedAt: now,
          deliverySlot: dto.deliverySlot ?? null,
          estimatedEtaAt,
          trackingNo,
          dispatchNo: order.dispatch?.dispatchNo ?? dispatchNo,
        },
        create: {
          orderId: dto.orderId,
          hubId,
          dispatchNo,
          trackingNo,
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
          remarks: dto.remarks,
          status: 'IN_PROGRESS',
          dispatchedAt: now,
          deliverySlot: dto.deliverySlot ?? null,
          estimatedEtaAt,
        },
        include: { driver: true, vehicle: true },
      });

      await tx.driver.update({
        where: { id: dto.driverId },
        data: {
          availability: 'ON_DELIVERY',
          vehicleId: dto.vehicleId,
        },
      });

      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: {
          status: 'OUT_FOR_DELIVERY',
          currentOrderId: dto.orderId,
          currentDispatchId: dispatch.id,
        },
      });

      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: dto.vehicleId,
          fromStatus: vehicle.status,
          toStatus: 'OUT_FOR_DELIVERY',
          changedBy: updatedBy,
          reason: `Dispatched ${dispatch.dispatchNo}`,
          orderId: dto.orderId,
          dispatchId: dispatch.id,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: dto.orderId },
        data: {
          orderStatus: 'OUT_FOR_DELIVERY',
          assignedDriverId: dto.driverId,
          assignedVehicleId: dto.vehicleId,
          expectedDeliveryAt: estimatedEtaAt,
          dispatchedAt: now,
        },
      });

      await tx.orderTimeline.createMany({
        data: [
          {
            orderId: dto.orderId,
            status: 'DRIVER_ASSIGNED',
            updatedBy,
            updatedByRole: 'HUB_MANAGER',
            message: `Driver Assigned: ${driver.name}`,
            remarks: `Driver Assigned: ${driver.name}`,
          },
          {
            orderId: dto.orderId,
            status: 'OUT_FOR_DELIVERY',
            updatedBy,
            updatedByRole: 'HUB_MANAGER',
            message: `Dispatched — ${dispatch.dispatchNo}`,
            remarks: dto.remarks ?? `Vehicle ${vehicle.registration}`,
          },
        ],
      });

      await tx.hubNotification.create({
        data: {
          hubId,
          type: 'DISPATCH',
          title: 'Dispatch Successful',
          body: `${dispatch.dispatchNo} created for ${order.orderNumber}`,
          actionRoute: `/dispatch/${dispatch.dispatchNo}`,
        },
      });

      // Soft audit via timeline; admin AuditLog is admin-scoped
      this.logger.log(
        `Dispatch planned dispatchNo=${dispatch.dispatchNo} order=${order.orderNumber} driver=${driver.name} vehicle=${vehicle.registration}`,
      );

      return {
        dispatch,
        order: updatedOrder,
        driver,
        vehicle,
        customer: order.customer,
      };
    });

    this.orderEvents.emitOrderUpdated({
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.orderStatus,
      statusLabel: getOrderStatusLabel(result.order.orderStatus),
      customerId: result.order.customerId,
      hubId,
      driverId: result.driver.id,
      updatedAt: result.order.updatedAt.toISOString(),
      trackingStatus: 'OUT_FOR_DELIVERY',
      driver: {
        id: result.driver.id,
        name: result.driver.name,
        phone: result.driver.phone,
      },
      vehicle: {
        id: result.vehicle.id,
        registration: result.vehicle.registration,
      },
      eta: result.order.expectedDeliveryAt?.toISOString() ?? null,
      expectedDeliveryAt:
        result.order.expectedDeliveryAt?.toISOString() ?? null,
    });

    const detail = await this.getById(hubId, result.dispatch.id);
    return detail;
  }

  /** Legacy create — delegates to planAndDispatch when driver+vehicle provided. */
  async create(
    hubId: string,
    dto: HubDispatchCreateDto,
    updatedBy = 'HUB_SYSTEM',
  ) {
    if (dto.driverId && dto.vehicleId) {
      return this.planAndDispatch(hubId, dto, updatedBy);
    }

    await this.orderRepo.findHubOrder(dto.orderId, hubId);
    return this.prisma.hubDispatch.upsert({
      where: { orderId: dto.orderId },
      update: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        remarks: dto.remarks,
        status: 'PENDING',
        deliverySlot: dto.deliverySlot,
      },
      create: {
        orderId: dto.orderId,
        hubId,
        dispatchNo: generateDispatchNo(),
        trackingNo: generateTrackingNo(),
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        remarks: dto.remarks,
        status: 'PENDING',
        deliverySlot: dto.deliverySlot,
      },
      include: { driver: true, vehicle: true, order: true },
    });
  }

  async update(hubId: string, id: string, dto: HubDispatchUpdateDto) {
    const dispatch = await this.prisma.hubDispatch.findFirst({
      where: { id, hubId },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    return this.prisma.hubDispatch.update({
      where: { id },
      data: {
        ...(dto.driverId && { driverId: dto.driverId }),
        ...(dto.vehicleId && { vehicleId: dto.vehicleId }),
        ...(dto.remarks !== undefined && { remarks: dto.remarks }),
      },
      include: { driver: true, vehicle: true, order: true },
    });
  }

  async start(
    hubId: string,
    id: string,
    updatedBy: string,
    dto?: HubOrderActionDto,
  ) {
    const dispatch = await this.requireDispatch(hubId, id);
    await this.prisma.hubDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'IN_PROGRESS',
        dispatchedAt: dispatch.dispatchedAt ?? new Date(),
      },
    });
    return this.ordersService.dispatch(
      hubId,
      dispatch.orderId,
      { remarks: dto?.remarks ?? 'Dispatch started' },
      updatedBy,
    );
  }

  async markReached(
    hubId: string,
    id: string,
    updatedBy: string,
    dto?: HubOrderActionDto,
  ) {
    const dispatch = await this.requireDispatch(hubId, id);
    if (dispatch.vehicleId) {
      await this.prisma.vehicle.update({
        where: { id: dispatch.vehicleId },
        data: { status: 'REACHED' },
      });
      await this.prisma.vehicleStatusHistory.create({
        data: {
          vehicleId: dispatch.vehicleId,
          fromStatus: 'OUT_FOR_DELIVERY',
          toStatus: 'REACHED',
          changedBy: updatedBy,
          reason: 'Driver reached customer',
          orderId: dispatch.orderId,
          dispatchId: dispatch.id,
        },
      });
    }
    return this.ordersService.markDriverReached(
      hubId,
      dispatch.orderId,
      { remarks: dto?.remarks ?? 'Driver reached customer' },
      updatedBy,
    );
  }

  async verifyOtp(
    hubId: string,
    id: string,
    dto: HubVerifyDeliveryOtpDto,
    updatedBy: string,
  ) {
    const dispatch = await this.requireDispatch(hubId, id);
    return this.ordersService.verifyDeliveryOtp(
      hubId,
      dispatch.orderId,
      dto,
      updatedBy,
    );
  }

  async markDelivered(
    hubId: string,
    id: string,
    updatedBy: string,
    dto?: HubOrderActionDto,
  ) {
    const dispatch = await this.requireDispatch(hubId, id);
    return this.ordersService.deliver(
      hubId,
      dispatch.orderId,
      { remarks: dto?.remarks ?? 'Delivered' },
      updatedBy,
    );
  }

  async complete(
    hubId: string,
    id: string,
    updatedBy = 'HUB_SYSTEM',
    dto?: HubOrderActionDto,
  ) {
    const dispatch = await this.requireDispatch(hubId, id);
    const order = await this.ordersService.completeDelivery(
      hubId,
      dispatch.orderId,
      { remarks: dto?.remarks ?? 'Dispatch completed' },
      updatedBy,
    );
    return order;
  }

  private async requireDispatch(hubId: string, id: string) {
    const dispatch = await this.prisma.hubDispatch.findFirst({
      where: {
        hubId,
        OR: [{ id }, { dispatchNo: id }, { trackingNo: id }],
      },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    return dispatch;
  }
}
