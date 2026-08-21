import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import {
  OrderStatusResponseDto,
  OrderTimelineEventDto,
} from '../orders/dto/order-response.dto';
import { getCustomerOrderStatusLabel } from '../../common/delivery/customer-delivery.util';

@Injectable()
export class OrderTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async getTimeline(
    customerId: string,
    orderId: string,
  ): Promise<OrderTimelineEventDto[]> {
    await this.ordersService.ensureOwnedOrder(customerId, orderId);

    const events = await this.prisma.orderTimeline.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return events.map((event) => this.ordersService.mapTimelineEvent(event));
  }

  async getStatus(
    customerId: string,
    orderId: string,
  ): Promise<OrderStatusResponseDto> {
    const order = await this.ordersService.ensureOwnedOrder(
      customerId,
      orderId,
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: getCustomerOrderStatusLabel(order.orderStatus),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async getTracking(customerId: string, orderId: string) {
    const order = await this.ordersService.findOne(customerId, orderId);
    const steps = order.timeline.map((event, index) => ({
      key: event.status.toLowerCase(),
      label: event.statusLabel,
      time: new Date(event.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      done: index < order.timeline.length - 1 || order.status === 'DELIVERED',
      active:
        index === order.timeline.length - 1 && order.status !== 'DELIVERED',
    }));

    return {
      currentStep: order.status,
      statusLabel: order.statusLabel,
      steps,
      estimatedArrival: order.expectedDeliveryAt ?? undefined,
      driver: order.driver
        ? {
            name: order.driver.name,
            phone: order.driver.phone,
            vehicleNumber: order.driver.vehicleNumber ?? '',
          }
        : undefined,
      orderNumber: order.orderNumber,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status,
    };
  }
}
