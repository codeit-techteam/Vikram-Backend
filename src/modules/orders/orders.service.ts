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
import {
  getCustomerOrderStatusLabel,
  sanitizeCustomerTimelineMessage,
} from '../../common/delivery/customer-delivery.util';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { formatOrderNumber } from '../../common/shopping/pricing.util';
import { hashQueryParams } from '../../common/utils/prisma.util';
import { CheckoutService } from '../checkout/checkout.service';
import { NotificationService } from '../notification/notification.service';
import { LoyaltyTransactionService } from '../loyalty/loyalty-transaction.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { PlaceOrderDto, OrderResponseDto } from './dto/order.dto';
import { OrderListQueryDto } from './dto/order-query.dto';
import {
  OrderDetailResponseDto,
  OrderItemResponseDto,
  OrderListItemDto,
  OrderListResponseDto,
  OrderTimelineEventDto,
} from './dto/order-response.dto';
import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS_LABELS,
  decimalToNumber,
} from './orders.constants';
import { getOrderStatusLabel } from './order-lifecycle.constants';
import { OrderEventsService } from './order-events.service';

const ORDER_ITEM_PRODUCT_SELECT = {
  id: true,
  name: true,
  sku: true,
  brand: true,
  unit: true,
  spec: true,
  retailPrice: true,
  category: { select: { name: true } },
  images: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }],
    take: 1,
    select: { url: true },
  },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    take: 1,
    select: { id: true, label: true, displayUnit: true },
  },
} satisfies Prisma.ProductSelect;

const ORDER_ITEMS_WITH_PRODUCT = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    product: { select: ORDER_ITEM_PRODUCT_SELECT },
  },
} satisfies Prisma.Order$itemsArgs;

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
  assignedDriver: {
    select: {
      id: true,
      name: true,
      phone: true,
      vehicle: { select: { id: true, registration: true, vehicleType: true } },
    },
  },
  assignedVehicle: {
    select: {
      id: true,
      registration: true,
      vehicleType: true,
    },
  },
  items: ORDER_ITEMS_WITH_PRODUCT,
  timeline: {
    orderBy: { createdAt: 'asc' as const },
  },
  invoice: {
    select: {
      id: true,
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
    private readonly loyaltyTransactionService: LoyaltyTransactionService,
    private readonly orderEvents: OrderEventsService,
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
      loyaltyPointsToRedeem: dto.loyaltyPointsToRedeem,
    });

    const nearestHub = await this.checkoutService.findNearestHubWithStock(
      checkout.address,
      checkout.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );

    const order = await this.prisma.$transaction(
      async (tx) => {
        const orderNumber = await this.nextOrderNumber(tx);
        const hubCanFulfill = nearestHub?.canFulfill === true;
        const assignedHubId = hubCanFulfill ? nearestHub!.id : null;
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
            discountAmount: checkout.discount,
            membershipDiscount: checkout.membershipDiscount,
            loyaltyPointsUsed: checkout.loyaltyUsed,
            grandTotal: checkout.grandTotal,
            notes: dto.notes ?? null,
            deliveryAddress: {
              id: checkout.address.id,
              label: checkout.address.label,
              siteName: checkout.address.label,
              line1: checkout.address.line1,
              line2: checkout.address.line2,
              landmark: (checkout.address as { landmark?: string | null }).landmark ?? null,
              gateNumber: (checkout.address as { gateNumber?: string | null }).gateNumber ?? null,
              floor: (checkout.address as { floor?: string | null }).floor ?? null,
              city: checkout.address.city,
              state: checkout.address.state,
              pincode: checkout.address.pincode,
              contactPerson: (checkout.address as { contactPerson?: string | null }).contactPerson ?? null,
              phone: (checkout.address as { phone?: string | null }).phone ?? null,
              latitude: checkout.address.latitude,
              longitude: checkout.address.longitude,
              deliveryNotes: (checkout.address as { deliveryNotes?: string | null }).deliveryNotes ?? null,
            },
            items: {
              create: checkout.items.map((item) => ({
                productId: item.productId,
                name: item.product.name,
                productImage: item.product.thumbnailUrl ?? null,
                sku: item.product.sku ?? null,
                brand: item.product.brand ?? null,
                category: item.product.category ?? null,
                variant: item.product.variant ?? null,
                quantity: item.quantity,
                unit: item.product.unit,
                unitPrice: item.price,
                mrp: item.product.mrp ?? item.price,
                gst: item.gst,
                subtotal: item.subtotal,
              })),
            },
            timeline: {
              create: [
                {
                  status: OrderStatus.PENDING,
                  remarks: 'Order Placed',
                  message: 'Order Placed',
                  updatedBy: 'SYSTEM',
                  updatedByRole: 'SYSTEM',
                },
                {
                  status: OrderStatus.CONFIRMED,
                  remarks: 'Confirmed',
                  message: 'Confirmed',
                  updatedBy: 'SYSTEM',
                  updatedByRole: 'SYSTEM',
                },
                hubCanFulfill
                  ? {
                      status: OrderStatus.HUB_ASSIGNED,
                      remarks: 'Preparing Order',
                      message: 'Preparing Order',
                      updatedBy: 'SYSTEM',
                      updatedByRole: 'SYSTEM',
                    }
                  : {
                      status: OrderStatus.AWAITING_HUB_ALLOCATION,
                      remarks: 'Preparing Order',
                      message: 'Preparing Order',
                      updatedBy: 'SYSTEM',
                      updatedByRole: 'SYSTEM',
                    },
              ],
            },
          },
          include: {
            items: ORDER_ITEMS_WITH_PRODUCT,
            timeline: { orderBy: { createdAt: 'asc' } },
            hub: true,
            address: true,
          },
        });

        const cart = await tx.cart.findUnique({ where: { customerId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }

        if (checkout.loyaltyUsed > 0) {
          await this.loyaltyTransactionService.commitRedemptionForPlacedOrder({
            customerId,
            orderId: created.id,
            orderNumber: created.orderNumber,
            points: checkout.loyaltyUsed,
            tx,
          });
        }

        return created;
      },
      { timeout: 15000 },
    );

    if (checkout.loyaltyUsed > 0) {
      await this.cache.del(CACHE_KEYS.LOYALTY(customerId));
    }

    await this.notificationService.createForCustomer({
      customerId,
      type: NotificationType.ORDER,
      label: 'ORDER PLACED',
      title: `Order ${order.orderNumber} placed successfully`,
      body: checkout.serviceable
        ? `Your order ${order.orderNumber} has been confirmed. Estimated delivery: ${checkout.deliveryMessage}. Grand total ₹${checkout.grandTotal}. Payment: ${paymentMethod}.`
        : `Your order ${order.orderNumber} has been placed. Grand total ₹${checkout.grandTotal}.`,
      actionLabel: 'View Order',
      actionRoute: `/(tabs)/orders`,
      actionVariant: 'outline',
      priority: 10,
    });

    if (nearestHub?.canFulfill) {
      await this.prisma.hubNotification.create({
        data: {
          hubId: nearestHub.id,
          type: 'ORDER',
          title: `New Order ${order.orderNumber}`,
          body: `COD order ₹${checkout.grandTotal} assigned. Accept and assign a driver.`,
        },
      });
    }

    await this.cache.invalidateAfterOrder(customerId);

    this.orderEvents.emitOrderUpdated({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: getCustomerOrderStatusLabel(order.orderStatus),
      updatedAt: order.updatedAt.toISOString(),
      hubId: order.hubId,
      customerId: order.customerId,
    });

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
      items: order.items.map((item) => this.mapOrderItem(item)),
      timeline: order.timeline.map((t) => this.mapTimelineEvent(t)),
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
          items: ORDER_ITEMS_WITH_PRODUCT,
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
      include: { items: ORDER_ITEMS_WITH_PRODUCT },
    });

    return orders.map((order) => this.mapListItem(order));
  }

  async reorder(
    customerId: string,
    orderId: string,
  ): Promise<{
    cartItemCount: number;
    message: string;
    products: OrderItemResponseDto[];
    addedCount: number;
    unavailableCount: number;
  }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      include: { items: ORDER_ITEMS_WITH_PRODUCT },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const products = order.items.map((item) => this.mapOrderItem(item));

    return {
      cartItemCount: products.length,
      message: 'Reorder items ready',
      products,
      addedCount: products.length,
      unavailableCount: 0,
    };
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

    await this.loyaltyTransactionService.refundRedemptionForCancelledOrder(
      orderId,
    );

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
    message?: string | null;
    updatedBy: string | null;
    updatedByRole?: string | null;
    createdAt: Date;
    updatedAt?: Date;
  }): OrderTimelineEventDto {
    const statusLabel = getCustomerOrderStatusLabel(event.status);
    const message = sanitizeCustomerTimelineMessage(
      event.status,
      event.message ?? event.remarks,
    );
    return {
      id: event.id,
      status: event.status,
      statusLabel,
      remarks: message,
      message,
      updatedBy: event.updatedBy ?? 'SYSTEM',
      updatedByRole: event.updatedByRole ?? null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: (event.updatedAt ?? event.createdAt).toISOString(),
    };
  }

  private mapOrderItem(item: {
    id: string;
    productId: string;
    variantId?: string | null;
    name: string;
    productImage?: string | null;
    sku?: string | null;
    brand?: string | null;
    category?: string | null;
    variant?: string | null;
    quantity: number;
    unit: string;
    unitPrice: unknown;
    mrp?: unknown;
    gst: unknown;
    subtotal: unknown;
    product?: {
      name?: string | null;
      sku?: string | null;
      brand?: string | null;
      unit?: string | null;
      spec?: string | null;
      retailPrice?: unknown;
      category?: { name: string } | null;
      images?: Array<{ url: string }>;
      variants?: Array<{
        id: string;
        label: string;
        displayUnit?: string | null;
      }>;
    } | null;
  }): OrderItemResponseDto {
    const product = item.product;
    const productName = item.name || product?.name || 'Product';
    const productImage =
      item.productImage ?? product?.images?.[0]?.url ?? null;
    const variant =
      item.variant ??
      product?.variants?.[0]?.label ??
      product?.variants?.[0]?.displayUnit ??
      product?.spec ??
      null;
    const unitPrice = decimalToNumber(item.unitPrice);
    const mrp =
      item.mrp != null
        ? decimalToNumber(item.mrp)
        : product?.retailPrice != null
          ? decimalToNumber(product.retailPrice)
          : null;

    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId ?? product?.variants?.[0]?.id ?? null,
      name: productName,
      productName,
      productImage,
      sku: item.sku ?? product?.sku ?? null,
      brand: item.brand ?? product?.brand ?? null,
      category: item.category ?? product?.category?.name ?? null,
      variant,
      quantity: item.quantity,
      unit: item.unit || product?.unit || '',
      unitPrice,
      price: unitPrice,
      mrp,
      gst: decimalToNumber(item.gst),
      subtotal: decimalToNumber(item.subtotal),
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
    updatedAt?: Date;
    deliveredAt?: Date | null;
    expectedDeliveryAt?: Date | null;
    isEmergency?: boolean;
    priorityOrder?: boolean;
    items: Array<Parameters<OrdersService['mapOrderItem']>[0]>;
  }): OrderListItemDto {
    const items = order.items.map((item) => this.mapOrderItem(item));
    const updatedAt = (order.updatedAt ?? order.createdAt).toISOString();
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      statusLabel: getCustomerOrderStatusLabel(order.orderStatus),
      itemCount: items.length,
      items,
      grandTotal: decimalToNumber(order.grandTotal),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      updatedAt,
      version: Date.parse(updatedAt) || (order.updatedAt ?? order.createdAt).getTime(),
      canCancel: CANCELLABLE_STATUSES.includes(order.orderStatus),
      isEmergency: order.isEmergency ?? false,
      priorityOrder: order.priorityOrder ?? false,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
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
      statusLabel: getCustomerOrderStatusLabel(order.orderStatus),
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
      version: order.updatedAt.getTime(),
      customer: {
        id: order.customer.id,
        phone: order.customer.phone,
        email: order.customer.email,
        fullName: order.customer.fullName,
      },
      items: order.items.map((item) => this.mapOrderItem(item)),
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
      invoiceId: order.invoice?.id ?? null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      isEmergency: order.isEmergency,
      loyaltyPointsUsed: order.loyaltyPointsUsed,
      membershipDiscount: decimalToNumber(order.membershipDiscount),
      bulkProcurement: order.bulkOrder,
      priorityOrder: order.priorityOrder,
      driver: order.assignedDriver
        ? {
            id: order.assignedDriver.id,
            name: order.assignedDriver.name,
            phone: order.assignedDriver.phone,
            vehicleNumber:
              order.assignedVehicle?.registration ??
              order.assignedDriver.vehicle?.registration ??
              null,
            vehicleType:
              order.assignedVehicle?.vehicleType ??
              order.assignedDriver.vehicle?.vehicleType ??
              null,
          }
        : null,
      vehicle: order.assignedVehicle
        ? {
            id: order.assignedVehicle.id,
            registration: order.assignedVehicle.registration,
            vehicleType: order.assignedVehicle.vehicleType,
          }
        : null,
      driverReachedAt: order.driverReachedAt?.toISOString() ?? null,
      deliveryOtpGenerated: Boolean(order.deliveryOtpGeneratedAt),
      deliveryOtpGeneratedAt: order.deliveryOtpGeneratedAt?.toISOString() ?? null,
      deliveryOtpVerified: order.deliveryOtpVerified,
      deliveryCompletedAt: order.deliveryCompletedAt?.toISOString() ?? null,
    };
  }
}
