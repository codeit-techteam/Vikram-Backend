import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationType } from '../../generated/prisma/client';
import {
  getCustomerOrderStatusLabel,
  sanitizeCustomerTimelineMessage,
} from '../common/delivery/customer-delivery.util';
import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationService } from '../modules/notification/notification.service';
import { OrderEventsService } from '../modules/orders/order-events.service';
import type { OrderUpdatedPayload } from '../modules/orders/order-lifecycle.constants';
import { FcmPushService } from './fcm-push.service';
import { getOrderStatusPushCopy } from './order-status-messages';
import { OrdersGateway } from './orders.gateway';

@Injectable()
export class OrderRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderRealtimeService.name);
  private unsubscribe: (() => void) | null = null;
  private readonly recentNotifyKeys = new Map<string, number>();
  /** Serialize fan-out per order so rapid OTP→Delivered cannot emit stale OFD after Delivered. */
  private readonly orderChains = new Map<string, Promise<void>>();

  constructor(
    private readonly orderEvents: OrderEventsService,
    private readonly gateway: OrdersGateway,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly fcmPush: FcmPushService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.orderEvents.onOrderUpdated((payload) => {
      this.logger.log(
        `[Realtime] Status Updated orderId=${payload.orderId} status=${payload.status} tracking=${payload.trackingStatus ?? payload.status}`,
      );
      this.enqueue(payload.orderId, () => this.handleOrderUpdated(payload));
    });
    this.logger.log(
      'Listening for ORDER_UPDATED → Socket.IO order.updated (serialized per order)',
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private enqueue(orderId: string, task: () => Promise<void>): void {
    const prev = this.orderChains.get(orderId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        this.logger.error(
          `[Realtime] broadcast failed orderId=${orderId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      })
      .finally(() => {
        if (this.orderChains.get(orderId) === next) {
          this.orderChains.delete(orderId);
        }
      });
    this.orderChains.set(orderId, next);
  }

  private async handleOrderUpdated(
    payload: OrderUpdatedPayload,
  ): Promise<void> {
    const enriched = await this.enrichPayload(payload);
    this.logger.log(
      `[Realtime] Backend Event Emitted orderId=${enriched.orderId} status=${enriched.status} updatedAt=${enriched.updatedAt}`,
    );

    // Bust Redis list/detail caches so HTTP refetch cannot serve stale OFD after Delivered.
    if (enriched.customerId) {
      await this.cache.invalidateOrders(enriched.customerId);
    }

    this.gateway.emitOrderStatusUpdated(enriched);
    await this.notifyCustomer(enriched);
  }

  private async enrichPayload(
    payload: OrderUpdatedPayload,
  ): Promise<OrderUpdatedPayload> {
    const order = await this.prisma.order.findFirst({
      where: { id: payload.orderId, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        customerId: true,
        hubId: true,
        assignedDriverId: true,
        assignedVehicleId: true,
        expectedDeliveryAt: true,
        driverReachedAt: true,
        deliveryOtp: true,
        deliveryOtpVerified: true,
        updatedAt: true,
        assignedDriver: {
          select: { id: true, name: true, phone: true },
        },
        assignedVehicle: {
          select: { id: true, registration: true, vehicleType: true },
        },
        timeline: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            message: true,
            remarks: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      return {
        ...payload,
        statusLabel: getCustomerOrderStatusLabel(payload.status),
        version: Date.parse(payload.updatedAt) || Date.now(),
      };
    }

    const trackingStatus =
      payload.trackingStatus ??
      (order.driverReachedAt ? 'REACHED_CUSTOMER' : order.orderStatus);

    const timeline = order.timeline.map((entry) => {
      const statusLabel = getCustomerOrderStatusLabel(entry.status);
      const message = sanitizeCustomerTimelineMessage(
        entry.status,
        entry.message ?? entry.remarks,
      );
      return {
        id: entry.id,
        status: String(entry.status),
        statusLabel,
        message,
        createdAt: entry.createdAt.toISOString(),
      };
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      // Always prefer committed DB status (source of truth after transaction).
      status: order.orderStatus,
      statusLabel: getCustomerOrderStatusLabel(order.orderStatus),
      oldStatus: payload.oldStatus ?? null,
      updatedAt: order.updatedAt.toISOString(),
      version: order.updatedAt.getTime(),
      hubId: order.hubId,
      customerId: order.customerId,
      driverId: order.assignedDriverId,
      eta: order.expectedDeliveryAt?.toISOString() ?? payload.eta ?? null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      trackingStatus,
      driver: order.assignedDriver
        ? {
            id: order.assignedDriver.id,
            name: order.assignedDriver.name,
            phone: order.assignedDriver.phone,
          }
        : (payload.driver ?? null),
      vehicle: order.assignedVehicle
        ? {
            id: order.assignedVehicle.id,
            registration: order.assignedVehicle.registration,
            type: String(order.assignedVehicle.vehicleType),
          }
        : (payload.vehicle ?? null),
      driverReachedAt: order.driverReachedAt?.toISOString() ?? null,
      deliveryOtpGenerated: Boolean(order.deliveryOtp),
      deliveryOtpVerified: Boolean(order.deliveryOtpVerified),
      timeline,
    };
  }

  private async notifyCustomer(payload: OrderUpdatedPayload): Promise<void> {
    if (!payload.customerId) return;

    const statusKey = String(payload.status).toUpperCase();
    const isReached = payload.trackingStatus === 'REACHED_CUSTOMER';
    const isOtpGenerated =
      payload.deliveryOtpGenerated &&
      !payload.deliveryOtpVerified &&
      statusKey === 'OUT_FOR_DELIVERY';
    const isOtpVerified =
      payload.deliveryOtpVerified && statusKey === 'OUT_FOR_DELIVERY';

    if (
      !isReached &&
      !isOtpGenerated &&
      !isOtpVerified &&
      [
        'PENDING',
        'CONFIRMED',
        'HUB_ASSIGNED',
        'AWAITING_HUB_ALLOCATION',
      ].includes(statusKey)
    ) {
      return;
    }

    const notifyKey = `${payload.orderId}:${
      isReached
        ? 'REACHED'
        : isOtpVerified
          ? 'OTP_VERIFIED'
          : isOtpGenerated
            ? 'OTP_GENERATED'
            : statusKey
    }`;
    const now = Date.now();
    const last = this.recentNotifyKeys.get(notifyKey);
    if (last && now - last < 15_000) {
      return;
    }
    this.recentNotifyKeys.set(notifyKey, now);
    this.pruneNotifyKeys(now);

    let copy = getOrderStatusPushCopy(
      payload.status,
      isReached ? 'REACHED_CUSTOMER' : null,
    );
    if (isOtpGenerated) {
      copy = {
        title: 'Delivery OTP sent',
        body: 'Your delivery OTP has been generated.',
        label: 'OTP GENERATED',
      };
    } else if (isOtpVerified) {
      copy = {
        title: 'OTP verified',
        body: 'Delivery OTP verified successfully.',
        label: 'OTP VERIFIED',
      };
    }

    const orderRef = payload.orderNumber ?? payload.orderId;
    await this.notificationService.createForCustomer({
      customerId: payload.customerId,
      type: NotificationType.ORDER,
      label: copy.label,
      title: copy.title,
      body: `${copy.body} (${orderRef})`,
      actionLabel: statusKey === 'DELIVERED' ? 'View Order' : 'Track Order',
      actionRoute:
        statusKey === 'DELIVERED'
          ? `/orders/view/${payload.orderId}`
          : `/orders/details/${payload.orderId}`,
      actionVariant: 'primary',
      priority: payload.status === 'DELIVERED' ? 20 : 10,
    });

    await this.fcmPush.sendToCustomer(
      payload.customerId,
      copy.title,
      `${copy.body} (${orderRef})`,
      {
        type: 'ORDER_STATUS',
        orderId: payload.orderId,
        status: String(payload.status),
        trackingStatus: String(payload.trackingStatus ?? ''),
      },
    );
  }

  private pruneNotifyKeys(now: number): void {
    if (this.recentNotifyKeys.size < 200) return;
    for (const [key, ts] of this.recentNotifyKeys) {
      if (now - ts > 60_000) this.recentNotifyKeys.delete(key);
    }
  }
}
