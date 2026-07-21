import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ORDER_STATUS_LABELS } from '../orders/orders.constants';
import {
  OrderStatusResponseDto,
  OrderTimelineEventDto,
} from '../orders/dto/order-response.dto';

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
    const order = await this.ordersService.ensureOwnedOrder(customerId, orderId);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: ORDER_STATUS_LABELS[order.orderStatus],
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
