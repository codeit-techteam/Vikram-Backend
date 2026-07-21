import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { formatOrderNumber } from '../../common/shopping/pricing.util';
import { hashQueryParams } from '../../common/utils/prisma.util';
import { CheckoutService } from '../checkout/checkout.service';
import { NotificationService } from '../notification/notification.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { PlaceOrderDto, OrderResponseDto } from './dto/order.dto';
import { OrderListQueryDto } from './dto/order-query.dto';
import {
  OrderDetailResponseDto,
  OrderListItemDto,
  OrderListResponseDto,
  OrderTimelineEventDto,
} from './dto/order-response.dto';
import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS_LABELS,
  decimalToNumber,
} from './orders.constants';

const ORDER_DETAIL_INCLUDE = {
  customer: {
    select: {
      id: true,
      phone: true,
      email: true,
      fullName: true,
    },
  },
  address: true,
  hub: {
    select: {
      id: true,
      code: true,
      name: true,
      city: true,
      pincode: true,
      phone: true,
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
  },
  timeline: {
    orderBy: { createdAt: 'asc' as const },
  },
  invoice: {
    select: {
      status: true,
      invoiceNumber: true,
    },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly checkoutService: CheckoutService,
  ) {}

  async placeOrder(
    customerId: string,
    dto: PlaceOrderDto,
  ): Promise<OrderResponseDto> {
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;

    if (
      paymentMethod !== PaymentMethod.CASH &&
      paymentMethod !== PaymentMethod.MANUAL
    ) {
      throw new BadRequestException(
        'Only CASH or MANUAL payment is supported in MVP',
      );
    }

    const checkout = await this.checkoutService.prepareCheckout(customerId, {
      addressId: dto.addressId,
      notes: dto.notes,
    });

    const order = await this.prisma.$transaction(
      async (tx) => {
        const orderNumber = await this.nextOrderNumber(tx);
        const hubCanFulfill =
          checkout.hubAvailable && checkout.nearestHub != null;
        const assignedHubId = hubCanFulfill ? checkout.nearestHub!.id : null;
        const finalStatus = hubCanFulfill
          ? OrderStatus.HUB_ASSIGNED
          : OrderStatus.AWAITING_HUB_ALLOCATION;

        if (hubCanFulfill && assignedHubId) {
          for (const item of checkout.items) {
            const inv = await tx.hubInventory.findUnique({
              where: {
                hubId_productId: {
                  hubId: assignedHubId,
                  productId: item.productId,
                },
              },
            });

            if (!inv || inv.availableQty < item.quantity) {
              throw new BadRequestException(
                `Insufficient stock at hub for "${item.product.name}"`,
              );
            }

            await tx.hubInventory.update({
              where: { id: inv.id },
              data: {
                availableQty: { decrement: item.quantity },
                reservedQty: { increment: item.quantity },
              },
            });
          }
        }

        const created = await tx.order.create({
          data: {
            orderNumber,
            customerId,
            addressId: checkout.address.id,
            hubId: assignedHubId,
            orderStatus: finalStatus,
            paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
            subtotal: checkout.subtotal,
            gstAmount: checkout.gstAmount,
            deliveryCharge: checkout.deliveryCharge,
            discountAmount: checkout.membershipDiscount,
            membershipDiscount: checkout.membershipDiscount,
            grandTotal: checkout.grandTotal,
            notes: dto.notes ?? null,
            deliveryAddress: {
              id: checkout.address.id,
              label: checkout.address.label,
              line1: checkout.address.line1,
              line2: checkout.address.line2,
              city: checkout.address.city,
              state: checkout.address.state,
              pincode: checkout.address.pincode,
              latitude: checkout.address.latitude,
              longitude: checkout.address.longitude,
            },
            items: {
              create: checkout.items.map((item) => ({
                productId: item.productId,
                name: item.product.name,
                quantity: item.quantity,
                unit: item.product.unit,
                unitPrice: item.price,
                gst: item.gst,
                subtotal: item.subtotal,
              })),
            },
            timeline: {
              create: [
                {
                  status: OrderStatus.PENDING,
                  remarks: 'Order Placed',
                  updatedBy: 'SYSTEM',
                },
                {
                  status: OrderStatus.CONFIRMED,
                  remarks: 'Order Confirmed',
                  updatedBy: 'SYSTEM',
                },
                hubCanFulfill
                  ? {
                      status: OrderStatus.HUB_ASSIGNED,
                      remarks: `Hub Assigned — ${checkout.nearestHub!.code} (${checkout.nearestHub!.name})`,
                      updatedBy: 'SYSTEM',
                    }
                  : {
                      status: OrderStatus.AWAITING_HUB_ALLOCATION,
                      remarks:
                        'Awaiting Hub Allocation — no nearby hub has full stock',
                      updatedBy: 'SYSTEM',
                    },
              ],
            },
          },
          include: {
            items: true,
            timeline: { orderBy: { createdAt: 'asc' } },
            hub: true,
            address: true,
          },
        });

        const cart = await tx.cart.findUnique({ where: { customerId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }

        return created;
      },
      { timeout: 15000 },
    );

    await this.notificationService.createForCustomer({
      customerId,
      type: NotificationType.ORDER,
      label: 'ORDER PLACED',
      title: `Order ${order.orderNumber} placed successfully`,
      body: checkout.hubAvailable
        ? `Your order ${order.orderNumber} has been confirmed and assigned to ${checkout.nearestHub!.name}. Grand total ₹${checkout.grandTotal}. Payment: ${paymentMethod}.`
        : `Your order ${order.orderNumber} has been placed and is awaiting hub allocation. Grand total ₹${checkout.grandTotal}.`,
      actionLabel: 'View Order',
      actionRoute: `/(tabs)/orders`,
      actionVariant: 'outline',
      priority: 10,
    });

    await this.cache.invalidateAfterOrder(customerId);

    this.logger.log(
      `Order ${order.orderNumber} placed for customer ${customerId} status=${order.orderStatus}`,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: decimalToNumber(order.subtotal),
      gstAmount: decimalToNumber(order.gstAmount),
      deliveryCharge: decimalToNumber(order.deliveryCharge),
      grandTotal: decimalToNumber(order.grandTotal),
      notes: order.notes,
      address: {
        id: order.address.id,
        line1: order.address.line1,
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
      },
      hub: order.hub
        ? {
            id: order.hub.id,
            code: order.hub.code,
            name: order.hub.name,
            city: order.hub.city,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: decimalToNumber(item.unitPrice),
        gst: decimalToNumber(item.gst),
        subtotal: decimalToNumber(item.subtotal),
      })),
      timeline: order.timeline.map((t) => ({
        id: t.id,
        status: t.status,
        remarks: t.remarks,
        updatedBy: t.updatedBy,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await tx.orderNumberSequence.upsert({
      where: { year },
      create: { year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatOrderNumber(year, seq.lastValue);
  }

  async findAll(
    customerId: string,
    query: OrderListQueryDto,
  ): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const cacheKey =
      CACHE_KEYS.ORDERS(customerId) +
      `:${hashQueryParams({ ...query, page, limit })}`;

    const cached = await this.cache.get<OrderListResponseDto>(cacheKey);
    if (cached) return cached;

    const where: Prisma.OrderWhereInput = {
      customerId,
      deletedAt: null,
      ...(query.status ? { orderStatus: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate
                ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: { select: { id: true } },
        },
      }),
    ]);

    const result: OrderListResponseDto = {
      items: orders.map((order) => this.mapListItem(order)),
      meta: buildPaginationMeta(page, limit, total),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.ORDERS);
    return result;
  }

  async getRecentOrders(
    customerId: string,
    limit = 3,
  ): Promise<OrderListItemDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: { select: { id: true } } },
    });

    return orders.map((order) => this.mapListItem(order));
  }

  async findOne(
    customerId: string,
    orderId: string,
  ): Promise<OrderDetailResponseDto> {
    const cacheKey = CACHE_KEYS.ORDER_DETAIL(customerId, orderId);
    const cached = await this.cache.get<OrderDetailResponseDto>(cacheKey);
    if (cached) return cached;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      include: ORDER_DETAIL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const result = this.mapDetail(order);
    await this.cache.set(cacheKey, result, CACHE_TTL.ORDERS);
    return result;
  }

  async cancel(
    customerId: string,
    orderId: string,
    dto: CancelOrderDto,
  ): Promise<OrderDetailResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      throw new BadRequestException(
        `Order cannot be cancelled in status ${ORDER_STATUS_LABELS[order.orderStatus]}. ` +
          'Only Pending, Confirmed, or Hub Assigned orders can be cancelled.',
      );
    }

    const now = new Date();
    const cancelReason = dto.reason?.trim() || 'Cancelled by customer';

    await this.prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true },
      });

      if (order.hubId) {
        for (const item of items) {
          await tx.hubInventory.updateMany({
            where: {
              hubId: order.hubId,
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

      await tx.order.update({
        where: { id: orderId },
        data: {
          orderStatus: OrderStatus.CANCELLED,
          cancelReason,
          cancelledAt: now,
        },
      });

      await tx.orderTimeline.create({
        data: {
          orderId,
          status: OrderStatus.CANCELLED,
          remarks: cancelReason,
          updatedBy: 'CUSTOMER',
        },
      });

      await tx.invoice.updateMany({
        where: { orderId, deletedAt: null },
        data: { status: InvoiceStatus.CANCELLED },
      });
    });

    await this.notificationService.createForCustomer({
      customerId,
      type: NotificationType.ORDER,
      label: 'Order Cancelled',
      title: `Order ${order.orderNumber} cancelled`,
      body: `Your order ${order.orderNumber} has been cancelled successfully.`,
      actionLabel: 'View Order',
      actionRoute: `/orders/view/${orderId}`,
      actionVariant: 'primary',
      priority: 1,
    });

    await this.cache.invalidateOrders(customerId);
    await this.cache.invalidateProfile(customerId);

    return this.findOne(customerId, orderId);
  }

  async ensureOwnedOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  mapTimelineEvent(event: {
    id: string;
    status: OrderStatus;
    remarks: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt?: Date;
  }): OrderTimelineEventDto {
    return {
      id: event.id,
      status: event.status,
      statusLabel: ORDER_STATUS_LABELS[event.status],
      remarks: event.remarks,
      updatedBy: event.updatedBy ?? 'SYSTEM',
      createdAt: event.createdAt.toISOString(),
      updatedAt: (event.updatedAt ?? event.createdAt).toISOString(),
    };
  }

  private mapListItem(order: {
    id: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    grandTotal: unknown;
    paymentStatus: OrderListItemDto['paymentStatus'];
    paymentMethod: OrderListItemDto['paymentMethod'];
    createdAt: Date;
    isEmergency?: boolean;
    priorityOrder?: boolean;
    items: { id: string }[];
  }): OrderListItemDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: ORDER_STATUS_LABELS[order.orderStatus],
      itemCount: order.items.length,
      grandTotal: decimalToNumber(order.grandTotal),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      canCancel: CANCELLABLE_STATUSES.includes(order.orderStatus),
      isEmergency: order.isEmergency ?? false,
      priorityOrder: order.priorityOrder ?? false,
    };
  }

  private mapDetail(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>,
  ): OrderDetailResponseDto {
    const addressSnapshot =
      (order.deliveryAddress as Record<string, unknown> | null) ?? null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: ORDER_STATUS_LABELS[order.orderStatus],
      subtotal: decimalToNumber(order.subtotal),
      gstAmount: decimalToNumber(order.gstAmount),
      deliveryCharge: decimalToNumber(order.deliveryCharge),
      discountAmount: decimalToNumber(order.discountAmount),
      grandTotal: decimalToNumber(order.grandTotal),
      notes: order.notes,
      cancelReason: order.cancelReason,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      canCancel: CANCELLABLE_STATUSES.includes(order.orderStatus),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customer: {
        id: order.customer.id,
        phone: order.customer.phone,
        email: order.customer.email,
        fullName: order.customer.fullName,
      },
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: decimalToNumber(item.unitPrice),
        gst: decimalToNumber(item.gst),
        subtotal: decimalToNumber(item.subtotal),
      })),
      hub: order.hub
        ? {
            id: order.hub.id,
            code: order.hub.code,
            name: order.hub.name,
            city: order.hub.city,
            pincode: order.hub.pincode,
            phone: order.hub.phone,
          }
        : null,
      address: {
        id: order.address.id,
        label: order.address.label,
        line1:
          order.address.line1 ||
          String(addressSnapshot?.line1 ?? addressSnapshot?.address ?? ''),
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
        country: order.address.country,
      },
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
      },
      timeline: order.timeline.map((event) => this.mapTimelineEvent(event)),
      invoiceStatus: order.invoice?.status ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      isEmergency: order.isEmergency,
      walletAmountUsed: decimalToNumber(order.walletAmountUsed),
      loyaltyPointsUsed: order.loyaltyPointsUsed,
      membershipDiscount: decimalToNumber(order.membershipDiscount),
      bulkProcurement: order.bulkOrder,
      priorityOrder: order.priorityOrder,
    };
  }
}
