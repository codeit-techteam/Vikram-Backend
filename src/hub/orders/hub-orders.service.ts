import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { LoyaltyTransactionService } from '../../modules/loyalty/loyalty-transaction.service';
import {
  getOrderStatusLabel,
  ORDER_STATUS_TRANSITIONS,
  resolveStatusInput,
} from '../../modules/orders/order-lifecycle.constants';
import { OrderEventsService } from '../../modules/orders/order-events.service';
import { HUB_ORDER_FILTER_MAP } from '../constants/hub.constants';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubAssignDriverDto,
  HubAssignLoaderDto,
  HubAssignTeamDto,
  HubAssignVehicleDto,
  HubCancelOrderDto,
  HubOrderActionDto,
  HubOrderQueryDto,
  HubPodDto,
  HubRejectOrderDto,
  HubTimelineEntryDto,
  HubUpdateStatusDto,
  HubVerifyDeliveryOtpDto,
} from '../dto/hub.dto';

@Injectable()
export class HubOrdersService {
  private readonly logger = new Logger(HubOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly orderEvents: OrderEventsService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(hubId: string, query: HubOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { ...this.orderRepo.hubScope(hubId) };

    if (query.status) {
      where.orderStatus = query.status;
    } else if (query.filter) {
      if (query.filter === 'emergency') {
        where.isEmergency = true;
      } else if (query.filter === 'bulk') {
        where.bulkOrder = true;
      } else if (query.filter === 'membership') {
        where.membershipDiscount = { gt: 0 };
      } else if (HUB_ORDER_FILTER_MAP[query.filter]) {
        where.orderStatus = { in: HUB_ORDER_FILTER_MAP[query.filter] };
      }
    }

    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search } } },
      ];
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
      { isEmergency: 'desc' },
      { priorityOrder: 'desc' },
      { createdAt: 'desc' },
    ];

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          _count: { select: { items: true } },
          assignedDriver: { select: { id: true, name: true, phone: true } },
          assignedVehicle: { select: { id: true, registration: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const mapped = data.map((order) => ({
      ...order,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      invoiceId: order.invoice?.id ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
    }));

    return { data: mapped, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(hubId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...this.orderRepo.hubScope(hubId) },
      include: {
        ...this.orderRepo.orderDetailInclude(),
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
        manager: { select: { id: true, fullName: true, phone: true, employeeId: true } },
        dispatch: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found for this hub');
    }

    // Never expose the raw OTP to hub managers / clients
    const { deliveryOtp: _otp, ...safeOrder } = order;

    return {
      ...safeOrder,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      invoiceId: order.invoice?.id ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      loadingCharges: order.loadingCharges,
      unloadingCharges: order.unloadingCharges,
      membershipDiscount: order.membershipDiscount,
      loyaltyPoints: order.loyaltyPointsUsed,
      priorityOrder: order.priorityOrder,
      emergency: order.isEmergency,
      bulkOrder: order.bulkOrder,
      driver: order.assignedDriver,
      vehicle: order.assignedVehicle,
      loader: order.assignedLoader,
      deliveryOtpGenerated: Boolean(order.deliveryOtpGeneratedAt),
      deliveryVerificationLink: `https://delivery.bajriwala.in/verify/${order.orderNumber}`,
      dispatchHistory: order.dispatch
        ? [
            {
              dispatchNo: order.dispatch.dispatchNo,
              status: order.dispatch.status,
              vehicle: order.assignedVehicle?.registration ?? '—',
              driver: order.assignedDriver?.name ?? '—',
              dispatchedAt: order.dispatch.dispatchedAt ?? order.dispatchedAt,
              reachedAt: order.driverReachedAt,
              deliveredAt: order.deliveredAt ?? order.deliveryCompletedAt,
              deliveryOtpVerified: order.deliveryOtpVerified,
            },
          ]
        : order.dispatchedAt
          ? [
              {
                dispatchNo: `DSP-${order.orderNumber.slice(-8)}`,
                status: order.orderStatus === 'DELIVERED' ? 'COMPLETED' : 'IN_PROGRESS',
                vehicle: order.assignedVehicle?.registration ?? '—',
                driver: order.assignedDriver?.name ?? '—',
                dispatchedAt: order.dispatchedAt,
                reachedAt: order.driverReachedAt,
                deliveredAt: order.deliveredAt ?? order.deliveryCompletedAt,
                deliveryOtpVerified: order.deliveryOtpVerified,
              },
            ]
          : [],
      timeline: order.timeline.map((entry) => ({
        ...entry,
        statusLabel: getOrderStatusLabel(entry.status),
        message: entry.message ?? entry.remarks ?? getOrderStatusLabel(entry.status),
      })),
    };
  }

  private emitUpdated(
    order: {
      id: string;
      orderNumber: string;
      orderStatus: OrderStatus;
      updatedAt: Date;
      hubId?: string | null;
      customerId?: string;
      assignedDriverId?: string | null;
      expectedDeliveryAt?: Date | null;
    },
    extras?: Partial<{
      oldStatus: OrderStatus | string | null;
      trackingStatus: string;
    }>,
  ) {
    this.logger.log(
      `[Hub] Status Updated orderId=${order.id} status=${order.orderStatus} tracking=${extras?.trackingStatus ?? order.orderStatus}`,
    );
    this.orderEvents.emitOrderUpdated({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      updatedAt: order.updatedAt.toISOString(),
      hubId: order.hubId,
      customerId: order.customerId,
      driverId: order.assignedDriverId ?? null,
      eta: order.expectedDeliveryAt?.toISOString() ?? null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      oldStatus: extras?.oldStatus ?? null,
      trackingStatus: extras?.trackingStatus ?? order.orderStatus,
    });
  }

  private async transitionOrder(
    hubId: string,
    orderId: string,
    nextStatus: OrderStatus,
    updatedBy: string,
    extra?: Prisma.OrderUpdateInput,
    remarks?: string,
    updatedByRole = 'HUB_MANAGER',
  ) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const message = remarks ?? getOrderStatusLabel(nextStatus);

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { orderStatus: nextStatus, ...extra },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId,
          status: nextStatus,
          updatedBy,
          updatedByRole,
          remarks: message,
          message,
        },
      }),
    ]);

    this.emitUpdated(updated);
    return updated;
  }

  private async consumeReservedStock(hubId: string, orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });

    for (const item of items) {
      await this.prisma.hubInventory.updateMany({
        where: {
          hubId,
          productId: item.productId,
          reservedQty: { gte: item.quantity },
        },
        data: {
          reservedQty: { decrement: item.quantity },
        },
      });
    }
  }

  private async releaseReservedStock(hubId: string, orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });

    for (const item of items) {
      await this.prisma.hubInventory.updateMany({
        where: {
          hubId,
          productId: item.productId,
          reservedQty: { gte: item.quantity },
        },
        data: {
          availableQty: { increment: item.quantity },
          reservedQty: { decrement: item.quantity },
        },
      });
    }
  }

  async updateStatus(
    hubId: string,
    orderId: string,
    dto: HubUpdateStatusDto,
    updatedBy: string,
    updatedByRole = 'HUB_MANAGER',
  ) {
    const next = resolveStatusInput(dto.status);
    if (!next) {
      throw new BadRequestException(`Unknown status: ${dto.status}`);
    }

    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const allowed = ORDER_STATUS_TRANSITIONS[order.orderStatus] ?? [];
    if (!allowed.includes(next) && next !== order.orderStatus) {
      throw new BadRequestException(
        `Cannot transition from ${order.orderStatus} to ${next}`,
      );
    }

    switch (next) {
      case 'ACCEPTED_BY_HUB':
        return this.accept(hubId, orderId, { remarks: dto.remarks }, updatedBy);
      case 'PICKING':
        return this.markPicking(hubId, orderId, { remarks: dto.remarks }, updatedBy);
      case 'PACKED':
        return this.markPacked(hubId, orderId, { remarks: dto.remarks }, updatedBy);
      case 'DRIVER_ASSIGNED':
        if (!dto.driverId) {
          throw new BadRequestException('driverId is required for DriverAssigned');
        }
        return this.assignDriver(
          hubId,
          orderId,
          {
            driverId: dto.driverId,
            vehicleId: dto.vehicleId,
            expectedDeliveryAt: dto.expectedDeliveryAt,
          },
          updatedBy,
        );
      case 'OUT_FOR_DELIVERY':
        return this.dispatch(hubId, orderId, { remarks: dto.remarks }, updatedBy);
      case 'DELIVERED':
        return this.deliver(hubId, orderId, { remarks: dto.remarks }, updatedBy);
      case 'CANCELLED':
        return this.cancel(
          hubId,
          orderId,
          { reason: dto.remarks || 'Cancelled by hub' },
          updatedBy,
        );
      default:
        return this.transitionOrder(
          hubId,
          orderId,
          next,
          updatedBy,
          undefined,
          dto.remarks,
          updatedByRole,
        );
    }
  }

  async accept(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const allowed: OrderStatus[] = ['HUB_ASSIGNED', 'CONFIRMED', 'PENDING', 'AWAITING_HUB_ALLOCATION'];
    if (!allowed.includes(order.orderStatus)) {
      throw new BadRequestException('Order cannot be accepted in current status');
    }

    return this.transitionOrder(
      hubId,
      orderId,
      'ACCEPTED_BY_HUB',
      updatedBy,
      undefined,
      dto.remarks ?? `Accepted by ${updatedBy}`,
    );
  }

  async reject(hubId: string, orderId: string, dto: HubRejectOrderDto, updatedBy: string) {
    await this.releaseReservedStock(hubId, orderId);
    return this.transitionOrder(
      hubId,
      orderId,
      'CANCELLED',
      updatedBy,
      {
        cancelReason: dto.reason,
        cancelledAt: new Date(),
        hubRejectReason: dto.reason,
        hubRejectedAt: new Date(),
      },
      dto.reason,
    );
  }

  async markPicking(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    await this.prisma.hubLoadingRecord.upsert({
      where: { orderId },
      update: { status: 'IN_PROGRESS', startedAt: new Date(), startedBy: updatedBy },
      create: {
        orderId,
        hubId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy: updatedBy,
        notes: dto.remarks,
      },
    });

    return this.transitionOrder(
      hubId,
      orderId,
      'PICKING',
      updatedBy,
      { loadingStartedAt: order.loadingStartedAt ?? new Date() },
      dto.remarks ?? 'Picking Started',
    );
  }

  async markLoading(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    if (order.orderStatus === 'ACCEPTED_BY_HUB' || order.orderStatus === 'PROCESSING') {
      return this.markPicking(hubId, orderId, dto, updatedBy);
    }
    return this.markPacked(hubId, orderId, dto, updatedBy);
  }

  async markPacked(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    await this.prisma.hubLoadingRecord.updateMany({
      where: { orderId },
      data: { status: 'COMPLETED', completedAt: new Date(), completedBy: updatedBy },
    });

    return this.transitionOrder(
      hubId,
      orderId,
      'PACKED',
      updatedBy,
      { loadingCompletedAt: new Date() },
      dto.remarks ?? 'Packed',
    );
  }

  async markReady(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    return this.markPacked(hubId, orderId, dto, updatedBy);
  }

  async dispatch(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    await this.prisma.hubDispatch.upsert({
      where: { orderId },
      update: {
        status: 'IN_PROGRESS',
        dispatchedAt: new Date(),
        driverId: order.assignedDriverId ?? undefined,
        vehicleId: order.assignedVehicleId ?? undefined,
      },
      create: {
        orderId,
        hubId,
        dispatchNo: `DSP-${Date.now().toString().slice(-8)}`,
        status: 'IN_PROGRESS',
        dispatchedAt: new Date(),
        driverId: order.assignedDriverId,
        vehicleId: order.assignedVehicleId,
        remarks: dto.remarks,
      },
    });

    if (order.assignedDriverId) {
      await this.prisma.driver.update({
        where: { id: order.assignedDriverId },
        data: { availability: 'ON_DELIVERY' },
      });
    }
    if (order.assignedVehicleId) {
      await this.prisma.vehicle.update({
        where: { id: order.assignedVehicleId },
        data: { status: 'IN_USE' },
      });
    }

    return this.transitionOrder(
      hubId,
      orderId,
      'OUT_FOR_DELIVERY',
      updatedBy,
      { dispatchedAt: new Date() },
      dto.remarks ?? 'Out For Delivery',
    );
  }

  async deliver(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    if (!order.deliveryOtpVerified) {
      throw new BadRequestException(
        'Delivery OTP must be verified before marking the order as delivered',
      );
    }

    return this.finalizeDelivery(hubId, orderId, dto.remarks ?? 'Order Delivered', updatedBy);
  }

  /**
   * Mark driver reached customer location. Order stays OUT_FOR_DELIVERY.
   */
  async markDriverReached(
    hubId: string,
    orderId: string,
    dto: HubOrderActionDto,
    updatedBy: string,
  ) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const status = String(order.orderStatus);
    if (status !== 'OUT_FOR_DELIVERY' && status !== 'DISPATCHED') {
      throw new BadRequestException(
        'Driver can only be marked reached after the order is out for delivery',
      );
    }
    if (order.driverReachedAt) {
      throw new BadRequestException('Driver already marked as reached');
    }

    const now = new Date();
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { driverReachedAt: now },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      dto.remarks ?? 'Driver Reached Customer',
    );

    this.emitUpdated(updated, { trackingStatus: 'REACHED_CUSTOMER' });
    return this.findOne(hubId, orderId);
  }

  /**
   * Generate a 6-digit delivery OTP. OTP is stored but never returned to the hub.
   */
  async generateDeliveryOtp(
    hubId: string,
    orderId: string,
    dto: HubOrderActionDto,
    updatedBy: string,
  ) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const status = String(order.orderStatus);
    if (status !== 'OUT_FOR_DELIVERY' && status !== 'DISPATCHED') {
      throw new BadRequestException(
        'OTP can only be generated while the order is out for delivery',
      );
    }
    if (!order.driverReachedAt) {
      throw new BadRequestException('Mark driver reached before generating delivery OTP');
    }
    if (order.deliveryOtpVerified) {
      throw new BadRequestException('Delivery OTP already verified');
    }

    const otp = this.generateDeliveryOtpCode();
    const now = new Date();

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryOtp: otp,
        deliveryOtpGeneratedAt: now,
        deliveryOtpVerified: false,
      },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      dto.remarks ?? 'Delivery OTP Generated',
    );

    // Mock: customer would receive OTP via SMS. Log for local testing only.
    console.info(
      `[mock-sms] Delivery OTP for ${order.orderNumber}: ${otp} (not returned to hub UI)`,
    );

    this.emitUpdated(updated);

    return {
      success: true,
      message: 'OTP generated successfully. Customer receives OTP.',
      deliveryOtpGenerated: true,
      deliveryOtpGeneratedAt: now,
      deliveryVerificationLink: `https://delivery.bajriwala.in/verify/${order.orderNumber}`,
      status: 'Waiting for OTP Verification',
    };
  }

  /**
   * Verify customer delivery OTP. On success, automatically completes delivery.
   */
  async verifyDeliveryOtp(
    hubId: string,
    orderId: string,
    dto: HubVerifyDeliveryOtpDto,
    updatedBy: string,
  ) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const status = String(order.orderStatus);
    if (status !== 'OUT_FOR_DELIVERY' && status !== 'DISPATCHED') {
      throw new BadRequestException('Order is not awaiting delivery verification');
    }
    if (!order.deliveryOtp || !order.deliveryOtpGeneratedAt) {
      throw new BadRequestException('Delivery OTP has not been generated yet');
    }
    if (order.deliveryOtpVerified) {
      throw new BadRequestException('Delivery OTP already verified');
    }

    const provided = String(dto.otp).trim();
    const devBypass = this.getDeliveryOtpBypassCode();
    const isDev = this.configService.get<string>('app.env') !== 'production';
    if (
      provided !== order.deliveryOtp &&
      !(isDev && devBypass && provided === devBypass)
    ) {
      throw new BadRequestException('Invalid OTP');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryOtpVerified: true,
        deliveryVerifiedBy: updatedBy,
      },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      'OTP Verified',
    );

    const delivered = await this.finalizeDelivery(
      hubId,
      orderId,
      'Order Delivered',
      updatedBy,
    );

    return {
      success: true,
      message: 'OTP Verified Successfully',
      order: delivered,
    };
  }

  /**
   * Explicit complete-delivery after OTP verification (idempotent if already delivered).
   */
  async completeDelivery(
    hubId: string,
    orderId: string,
    dto: HubOrderActionDto,
    updatedBy: string,
  ) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    if (order.orderStatus === 'DELIVERED') {
      return this.findOne(hubId, orderId);
    }

    if (!order.deliveryOtpVerified) {
      throw new BadRequestException(
        'Verify delivery OTP before completing delivery',
      );
    }

    return this.finalizeDelivery(
      hubId,
      orderId,
      dto.remarks ?? 'Order Delivered',
      updatedBy,
    );
  }

  private async finalizeDelivery(
    hubId: string,
    orderId: string,
    remarks: string,
    updatedBy: string,
  ) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    if (order.orderStatus === 'DELIVERED') {
      return this.findOne(hubId, orderId);
    }

    if (order.assignedDriverId) {
      await this.prisma.driver.update({
        where: { id: order.assignedDriverId },
        data: { availability: 'AVAILABLE' },
      });
    }
    if (order.assignedVehicleId) {
      await this.prisma.vehicle.update({
        where: { id: order.assignedVehicleId },
        data: { status: 'AVAILABLE' },
      });
    }

    await this.prisma.hubDispatch.updateMany({
      where: { orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const now = new Date();
    const isCod =
      String(order.paymentMethod).toUpperCase() === 'CASH' &&
      String(order.paymentStatus).toUpperCase() !== 'PAID';

    const paymentExtra: Prisma.OrderUpdateInput = isCod
      ? {
          paymentStatus: 'COLLECTED',
          paymentCollectedAt: now,
        }
      : {};

    const delivered = await this.transitionOrder(
      hubId,
      orderId,
      'DELIVERED',
      updatedBy,
      {
        deliveredAt: now,
        deliveryCompletedAt: now,
        deliveryOtpVerified: true,
        ...paymentExtra,
      },
      remarks,
    );

    await this.consumeReservedStock(hubId, orderId);
    await this.loyaltyTransactionService.earnForDeliveredOrder(orderId);

    return this.findOne(hubId, delivered.id);
  }

  async cancel(hubId: string, orderId: string, dto: HubCancelOrderDto, updatedBy: string) {
    await this.releaseReservedStock(hubId, orderId);
    return this.transitionOrder(
      hubId,
      orderId,
      'CANCELLED',
      updatedBy,
      { cancelReason: dto.reason, cancelledAt: new Date() },
      dto.reason,
    );
  }

  async getTimeline(hubId: string, orderId: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const events = await this.prisma.orderTimeline.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((entry) => ({
      ...entry,
      statusLabel: getOrderStatusLabel(entry.status),
      message: entry.message ?? entry.remarks ?? getOrderStatusLabel(entry.status),
    }));
  }

  async addTimeline(
    hubId: string,
    orderId: string,
    dto: HubTimelineEntryDto,
    updatedBy: string,
  ) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    return this.orderRepo.addTimeline(orderId, dto.status, updatedBy, dto.remarks);
  }

  async assignDriver(
    hubId: string,
    orderId: string,
    dto: HubAssignDriverDto & { vehicleId?: string; expectedDeliveryAt?: string },
    updatedBy: string,
  ) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, hubId, isActive: true, deletedAt: null },
    });
    if (!driver) throw new BadRequestException('Driver not found at this hub');

    const vehicleId = dto.vehicleId;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, hubId, isActive: true, deletedAt: null },
      });
      if (!vehicle) throw new BadRequestException('Vehicle not found at this hub');
    }

    const expectedDeliveryAt = dto.expectedDeliveryAt
      ? new Date(dto.expectedDeliveryAt)
      : undefined;

    return this.transitionOrder(
      hubId,
      orderId,
      'DRIVER_ASSIGNED',
      updatedBy,
      {
        assignedDriver: { connect: { id: dto.driverId } },
        ...(vehicleId ? { assignedVehicle: { connect: { id: vehicleId } } } : {}),
        ...(expectedDeliveryAt ? { expectedDeliveryAt } : {}),
      },
      `Driver Assigned: ${driver.name}`,
    );
  }

  async assignVehicle(hubId: string, orderId: string, dto: HubAssignVehicleDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, hubId, isActive: true, deletedAt: null },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found at this hub');

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedVehicleId: dto.vehicleId },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      `Vehicle assigned: ${vehicle.registration}`,
    );

    this.emitUpdated(order);
    return order;
  }

  async assignLoader(hubId: string, orderId: string, dto: HubAssignLoaderDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const loader = await this.prisma.hubUser.findFirst({
      where: { id: dto.loaderId, hubId, isActive: true, deletedAt: null },
    });
    if (!loader) throw new BadRequestException('Loader not found at this hub');

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedLoaderId: dto.loaderId },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      `Loader assigned: ${loader.fullName}`,
    );

    this.emitUpdated(order);
    return order;
  }

  async assignTeam(hubId: string, orderId: string, dto: HubAssignTeamDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);

    if (dto.driverId) {
      return this.assignDriver(
        hubId,
        orderId,
        {
          driverId: dto.driverId,
          vehicleId: dto.vehicleId,
        },
        updatedBy,
      );
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...(dto.vehicleId && { assignedVehicleId: dto.vehicleId }),
        ...(dto.loaderId && { assignedLoaderId: dto.loaderId }),
      },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      'Team assigned to order',
    );

    this.emitUpdated(order);
    return order;
  }

  async submitPod(hubId: string, orderId: string, dto: HubPodDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    if (!order.deliveryOtpVerified) {
      throw new BadRequestException(
        'Delivery OTP must be verified before submitting proof of delivery',
      );
    }

    const pod = await this.prisma.proofOfDelivery.upsert({
      where: { orderId },
      update: {
        deliveryPhotos: dto.deliveryPhotos ?? [],
        customerSignature: dto.customerSignature,
        otpVerified: true,
        remarks: dto.remarks,
        deliveredAt: new Date(),
        deliveredBy: updatedBy,
      },
      create: {
        orderId,
        deliveryPhotos: dto.deliveryPhotos ?? [],
        customerSignature: dto.customerSignature,
        otpVerified: true,
        remarks: dto.remarks,
        deliveredAt: new Date(),
        deliveredBy: updatedBy,
      },
    });

    await this.finalizeDelivery(hubId, orderId, dto.remarks ?? 'Order Delivered', updatedBy);
    return pod;
  }

  /** Fixed OTP in non-production for hub delivery verification testing. */
  private generateDeliveryOtpCode(): string {
    const isDev = this.configService.get<string>('app.env') !== 'production';
    if (isDev) {
      return this.getDeliveryOtpBypassCode();
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private getDeliveryOtpBypassCode(): string {
    return this.configService.get<string>('otp.devBypassCode') ?? '123456';
  }
}
