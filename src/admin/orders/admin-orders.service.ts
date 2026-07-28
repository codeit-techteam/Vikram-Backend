import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  getOrderStatusLabel,
  ORDER_STATUS_BUCKETS,
  ORDER_STATUS_TRANSITIONS,
  resolveStatusInput,
} from '../../modules/orders/order-lifecycle.constants';
import { OrderEventsService } from '../../modules/orders/order-events.service';
import type { AdminOrderQueryDto, UpdateOrderStatusDto, CancelOrderDto } from './dto/admin-orders.dto';
import type { OrderStatus } from '../../../generated/prisma/client';

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEvents: OrderEventsService,
  ) {}

  async findAll(query: AdminOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (query.bucket && ORDER_STATUS_BUCKETS[query.bucket as keyof typeof ORDER_STATUS_BUCKETS]) {
      where['orderStatus'] = {
        in: ORDER_STATUS_BUCKETS[query.bucket as keyof typeof ORDER_STATUS_BUCKETS],
      };
    } else if (query.status) {
      const resolved = resolveStatusInput(query.status);
      if (resolved) where['orderStatus'] = resolved;
      else where['orderStatus'] = query.status;
    }

    if (query.customerId) where['customerId'] = query.customerId;
    if (query.hubId) where['hubId'] = query.hubId;
    if (query.fromDate || query.toDate) {
      where['createdAt'] = {
        ...(query.fromDate && { gte: new Date(query.fromDate) }),
        ...(query.toDate && { lte: new Date(query.toDate) }),
      };
    }
    if (query.search) {
      where['orderNumber'] = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          hub: {
            select: {
              id: true,
              code: true,
              name: true,
              users: {
                where: { role: 'HUB_MANAGER', isActive: true, deletedAt: null },
                select: { id: true, fullName: true, employeeId: true, phone: true },
                take: 1,
              },
            },
          },
          manager: { select: { id: true, fullName: true, phone: true, employeeId: true } },
          assignedDriver: {
            select: {
              id: true,
              name: true,
              phone: true,
              vehicle: { select: { registration: true, vehicleType: true } },
            },
          },
          assignedVehicle: {
            select: { id: true, registration: true, vehicleType: true },
          },
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
          items: {
            select: {
              productId: true,
              name: true,
              unit: true,
              unitPrice: true,
              quantity: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const mapped = data.map((order) => ({
      ...order,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      invoiceId: order.invoice?.id ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      manager: order.manager ?? order.hub?.users?.[0] ?? null,
      hub: order.hub
        ? {
            id: order.hub.id,
            code: order.hub.code,
            name: order.hub.name,
          }
        : null,
    }));

    return { data: mapped, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { include: { profile: true } },
        address: true,
        hub: {
          include: {
            users: {
              where: { role: 'HUB_MANAGER', isActive: true, deletedAt: null },
              select: { id: true, fullName: true, employeeId: true, phone: true },
              take: 1,
            },
          },
        },
        manager: { select: { id: true, fullName: true, phone: true, employeeId: true } },
        assignedDriver: {
          include: { vehicle: { select: { registration: true, vehicleType: true } } },
        },
        assignedVehicle: true,
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        timeline: { orderBy: { createdAt: 'asc' } },
        invoice: true,
        dispatch: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const now = Date.now();
    const ageMs = now - order.createdAt.getTime();
    const { deliveryOtp: _otp, ...safeOrder } = order;

    return {
      ...safeOrder,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      invoiceId: order.invoice?.id ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      manager: order.manager ?? order.hub?.users?.[0] ?? null,
      orderAgeHours: Math.round(ageMs / (1000 * 60 * 60) * 10) / 10,
      deliveryOtpGenerated: Boolean(order.deliveryOtpGeneratedAt),
      deliveryVerification: {
        driverReached: Boolean(order.driverReachedAt),
        driverReachedAt: order.driverReachedAt?.toISOString() ?? null,
        otpGenerated: Boolean(order.deliveryOtpGeneratedAt),
        otpGeneratedAt: order.deliveryOtpGeneratedAt?.toISOString() ?? null,
        otpVerified: order.deliveryOtpVerified,
        verifiedBy: order.deliveryVerifiedBy,
        verifiedAt: order.deliveryCompletedAt?.toISOString() ?? order.deliveredAt?.toISOString() ?? null,
        delivered: order.orderStatus === 'DELIVERED',
        deliveredAt: order.deliveredAt?.toISOString() ?? null,
        deliveryCompletedAt: order.deliveryCompletedAt?.toISOString() ?? null,
        paymentCollectedAt: order.paymentCollectedAt?.toISOString() ?? null,
        driver: order.assignedDriver
          ? { id: order.assignedDriver.id, name: order.assignedDriver.name, phone: order.assignedDriver.phone }
          : null,
        vehicle: order.assignedVehicle
          ? { id: order.assignedVehicle.id, registration: order.assignedVehicle.registration }
          : null,
        hub: order.hub
          ? { id: order.hub.id, name: order.hub.name, code: order.hub.code }
          : null,
        verificationLink: `https://delivery.bajriwala.in/verify/${order.orderNumber}`,
      },
      tracking: {
        currentStatus: order.orderStatus,
        statusLabel: getOrderStatusLabel(order.orderStatus),
        hub: order.hub
          ? { id: order.hub.id, name: order.hub.name, code: order.hub.code }
          : null,
        driver: order.assignedDriver
          ? {
              id: order.assignedDriver.id,
              name: order.assignedDriver.name,
              phone: order.assignedDriver.phone,
              vehicle:
                order.assignedVehicle?.registration ??
                order.assignedDriver.vehicle?.registration ??
                null,
            }
          : null,
        lastUpdated: order.updatedAt.toISOString(),
        expectedDelivery: order.expectedDeliveryAt?.toISOString() ?? null,
        orderAgeHours: Math.round(ageMs / (1000 * 60 * 60) * 10) / 10,
      },
      timeline: order.timeline.map((entry) => ({
        ...entry,
        statusLabel: getOrderStatusLabel(entry.status),
        message: entry.message ?? entry.remarks ?? getOrderStatusLabel(entry.status),
      })),
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, updatedBy: string) {
    const order = await this.findOne(id);
    const next = resolveStatusInput(dto.status);
    if (!next) throw new BadRequestException(`Unknown status: ${dto.status}`);

    if (next === 'DELIVERED' && !order.deliveryOtpVerified) {
      throw new BadRequestException(
        'Delivery OTP must be verified at the hub before marking the order as delivered',
      );
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.orderStatus as OrderStatus] ?? [];
    if (!allowed.includes(next) && next !== order.orderStatus) {
      throw new BadRequestException(
        `Cannot transition from ${order.orderStatus} to ${next}`,
      );
    }

    const message = dto.remarks ?? getOrderStatusLabel(next);
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { orderStatus: next },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: next,
          remarks: message,
          message,
          updatedBy,
          updatedByRole: 'ADMIN',
        },
      }),
    ]);

    this.orderEvents.emitOrderUpdated({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.orderStatus,
      statusLabel: getOrderStatusLabel(updated.orderStatus),
      updatedAt: updated.updatedAt.toISOString(),
      hubId: updated.hubId,
      customerId: updated.customerId,
    });

    return updated;
  }

  async assignHub(id: string, hubId: string, updatedBy = 'ADMIN') {
    await this.findOne(id);
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { hubId, orderStatus: 'HUB_ASSIGNED' },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: 'HUB_ASSIGNED',
          message: 'Hub Assigned',
          remarks: 'Hub Assigned',
          updatedBy,
          updatedByRole: 'ADMIN',
        },
      }),
    ]);

    this.orderEvents.emitOrderUpdated({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.orderStatus,
      statusLabel: getOrderStatusLabel(updated.orderStatus),
      updatedAt: updated.updatedAt.toISOString(),
      hubId: updated.hubId,
      customerId: updated.customerId,
    });

    return updated;
  }

  async assignDriver(
    id: string,
    dto: { driverId: string; vehicleId?: string; expectedDeliveryAt?: string },
    updatedBy: string,
  ) {
    await this.findOne(id);
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, isActive: true, deletedAt: null },
    });
    if (!driver) throw new BadRequestException('Driver not found');

    const expectedDeliveryAt = dto.expectedDeliveryAt
      ? new Date(dto.expectedDeliveryAt)
      : undefined;

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: {
          assignedDriverId: dto.driverId,
          ...(dto.vehicleId ? { assignedVehicleId: dto.vehicleId } : {}),
          ...(expectedDeliveryAt ? { expectedDeliveryAt } : {}),
          orderStatus: 'DRIVER_ASSIGNED',
        },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: 'DRIVER_ASSIGNED',
          message: `Driver Assigned: ${driver.name}`,
          remarks: `Driver Assigned: ${driver.name}`,
          updatedBy,
          updatedByRole: 'ADMIN',
        },
      }),
    ]);

    this.orderEvents.emitOrderUpdated({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.orderStatus,
      statusLabel: getOrderStatusLabel(updated.orderStatus),
      updatedAt: updated.updatedAt.toISOString(),
      hubId: updated.hubId,
      customerId: updated.customerId,
    });

    return updated;
  }

  async cancelOrder(id: string, dto: CancelOrderDto, updatedBy: string) {
    await this.findOne(id);
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { orderStatus: 'CANCELLED', cancelReason: dto.reason, cancelledAt: new Date() },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: 'CANCELLED',
          remarks: dto.reason,
          message: dto.reason,
          updatedBy,
          updatedByRole: 'ADMIN',
        },
      }),
    ]);

    this.orderEvents.emitOrderUpdated({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.orderStatus,
      statusLabel: getOrderStatusLabel(updated.orderStatus),
      updatedAt: updated.updatedAt.toISOString(),
      hubId: updated.hubId,
      customerId: updated.customerId,
    });

    return updated;
  }

  async getTimeline(id: string) {
    await this.findOne(id);
    const events = await this.prisma.orderTimeline.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((entry) => ({
      ...entry,
      statusLabel: getOrderStatusLabel(entry.status),
      message: entry.message ?? entry.remarks ?? getOrderStatusLabel(entry.status),
    }));
  }

  async getTracking(id: string) {
    const order = await this.findOne(id);
    return order.tracking;
  }
}
