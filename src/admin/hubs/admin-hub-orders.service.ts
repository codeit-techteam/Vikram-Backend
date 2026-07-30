import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { getTodayRange } from '../../hub/common/hub-date.util';
import {
  getOrderStatusLabel,
  ORDER_STATUS_BUCKETS,
  resolveStatusInput,
} from '../../modules/orders/order-lifecycle.constants';
import type {
  AdminHubOrdersExportQueryDto,
  AdminHubOrdersQueryDto,
} from './dto/admin-hubs.dto';
import { HubOrderTab } from './dto/admin-hubs.dto';

const ACTIVE_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'HUB_ASSIGNED',
  'AWAITING_HUB_ALLOCATION',
  'ACCEPTED_BY_HUB',
  'PICKING',
  'PROCESSING',
  'PACKED',
  'READY_FOR_DISPATCH',
  'DRIVER_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DISPATCHED',
];

const PENDING_DISPATCH_STATUSES: OrderStatus[] = [
  'ACCEPTED_BY_HUB',
  'PICKING',
  'PROCESSING',
  'PACKED',
  'READY_FOR_DISPATCH',
  'DRIVER_ASSIGNED',
];

const OUT_FOR_DELIVERY_STATUSES: OrderStatus[] = ['OUT_FOR_DELIVERY', 'DISPATCHED'];

const LEGACY_ORDER_GROUP_MAP: Record<string, OrderStatus[]> = {
  PENDING: ORDER_STATUS_BUCKETS.pending,
  PROCESSING: [
    'ACCEPTED_BY_HUB',
    'PICKING',
    'PROCESSING',
    'PACKED',
    'READY_FOR_DISPATCH',
  ] as OrderStatus[],
  DISPATCHED: OUT_FOR_DELIVERY_STATUSES,
  DELIVERED: ['DELIVERED'] as OrderStatus[],
  CANCELLED: ['CANCELLED'] as OrderStatus[],
};

const ORDER_LIST_INCLUDE = {
  customer: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      profile: { select: { businessType: true, gstNumber: true, companyName: true } },
    },
  },
  hub: { select: { id: true, code: true, name: true } },
  assignedDriver: {
    select: {
      id: true,
      name: true,
      phone: true,
      vehicle: { select: { registration: true, vehicleType: true } },
    },
  },
  assignedVehicle: { select: { id: true, registration: true, vehicleType: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
  address: {
    select: { line1: true, line2: true, city: true, pincode: true, state: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type TrendMetric = { value: number; change: number; changePercent: number };

@Injectable()
export class AdminHubOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(hubId: string) {
    await this.assertHubExists(hubId);
    const hubScope = { hubId, deletedAt: null };
    const { start: todayStart, end: todayEnd } = getTodayRange();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      totalOrders,
      activeOrders,
      completedOrders,
      cancelledOrders,
      todaysOrders,
      yesterdaysOrders,
      ordersPendingDispatch,
      ordersOutForDelivery,
      deliveredToday,
      deliveredYesterday,
      totalRevenueAgg,
      pendingRevenueAgg,
      deliveryMetrics,
      todaysRevenueAgg,
      yesterdaysRevenueAgg,
    ] = await Promise.all([
      this.prisma.order.count({ where: hubScope }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: ACTIVE_STATUSES } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: OrderStatus.CANCELLED },
      }),
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: PENDING_DISPATCH_STATUSES } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: OUT_FOR_DELIVERY_STATUSES } },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: yesterdayStart, lt: yesterdayEnd },
        },
      }),
      this.prisma.order.aggregate({
        where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { ...hubScope, orderStatus: { in: ACTIVE_STATUSES } },
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
        take: 500,
        orderBy: { deliveredAt: 'desc' },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: { gte: yesterdayStart, lt: yesterdayEnd },
        },
        _sum: { grandTotal: true },
      }),
    ]);

    let averageDeliveryTimeHours = 0;
    if (deliveryMetrics.length > 0) {
      const totalHours = deliveryMetrics.reduce((sum, order) => {
        const dispatched = order.dispatchedAt!.getTime();
        const delivered = order.deliveredAt!.getTime();
        return sum + (delivered - dispatched) / (1000 * 60 * 60);
      }, 0);
      averageDeliveryTimeHours =
        Math.round((totalHours / deliveryMetrics.length) * 10) / 10;
    }

    const todaysRevenue = Number(todaysRevenueAgg._sum.grandTotal ?? 0);
    const yesterdaysRevenue = Number(yesterdaysRevenueAgg._sum.grandTotal ?? 0);

    return {
      totalOrders: this.withTrend(totalOrders, totalOrders),
      activeOrders: this.withTrend(activeOrders, activeOrders),
      completedOrders: this.withTrend(completedOrders, completedOrders),
      cancelledOrders: this.withTrend(cancelledOrders, cancelledOrders),
      todaysOrders: this.withTrend(todaysOrders, yesterdaysOrders),
      ordersPendingDispatch: this.withTrend(ordersPendingDispatch, ordersPendingDispatch),
      ordersOutForDelivery: this.withTrend(ordersOutForDelivery, ordersOutForDelivery),
      deliveredToday: this.withTrend(deliveredToday, deliveredYesterday),
      totalRevenue: {
        value: Number(totalRevenueAgg._sum.grandTotal ?? 0),
        change: todaysRevenue - yesterdaysRevenue,
        changePercent: this.percentChange(todaysRevenue, yesterdaysRevenue),
      },
      pendingRevenue: {
        value: Number(pendingRevenueAgg._sum.grandTotal ?? 0),
        change: 0,
        changePercent: 0,
      },
      averageDeliveryTimeHours: {
        value: averageDeliveryTimeHours,
        change: 0,
        changePercent: 0,
      },
      weekStart: weekStart.toISOString(),
      monthStart: monthStart.toISOString(),
    };
  }

  async getAnalytics(hubId: string) {
    await this.assertHubExists(hubId);
    const hubScope = { hubId, deletedAt: null };
    const { start: todayStart, end: todayEnd } = getTodayRange();

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      todaysOrders,
      thisWeekOrders,
      thisMonthOrders,
      revenueAgg,
      orderCount,
      topCategoryRows,
      topProductRows,
      repeatCustomerRows,
      pendingCodAgg,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: weekStart, lt: todayEnd } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: monthStart, lt: todayEnd } },
      }),
      this.prisma.order.aggregate({
        where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
        _sum: { grandTotal: true },
        _avg: { grandTotal: true },
      }),
      this.prisma.order.count({ where: hubScope }),
      this.prisma.orderItem.groupBy({
        by: ['category'],
        where: {
          order: { ...hubScope, orderStatus: { not: OrderStatus.CANCELLED } },
          category: { not: null },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: {
          order: { ...hubScope, orderStatus: { not: OrderStatus.CANCELLED } },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: hubScope,
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
          orderStatus: { notIn: [OrderStatus.CANCELLED] },
        },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
    ]);

    const topCategory = topCategoryRows[0];
    const topProduct = topProductRows[0];
    const repeatCustomers = repeatCustomerRows.filter(
      (row) => row._count._all > 1,
    ).length;

    return {
      todaysOrders,
      thisWeek: thisWeekOrders,
      thisMonth: thisMonthOrders,
      averageOrderValue: Math.round(Number(revenueAgg._avg.grandTotal ?? 0)),
      totalRevenue: Number(revenueAgg._sum.grandTotal ?? 0),
      highestSellingCategory: topCategory?.category ?? '—',
      highestSellingCategoryQty: topCategory?._sum.quantity ?? 0,
      highestSellingProduct: topProduct?.name ?? '—',
      highestSellingProductQty: topProduct?._sum.quantity ?? 0,
      repeatCustomers,
      totalCustomers: orderCount,
      pendingCodCollection: Number(pendingCodAgg._sum.grandTotal ?? 0),
      pendingCodOrders: pendingCodAgg._count._all,
    };
  }

  async listOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    await this.assertHubExists(hubId);
    return this.fetchOrders(hubId, query);
  }

  async listActiveOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    return this.fetchOrders(hubId, { ...query, tab: HubOrderTab.ACTIVE });
  }

  async listCompletedOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    return this.fetchOrders(hubId, { ...query, tab: HubOrderTab.COMPLETED });
  }

  async listCancelledOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    return this.fetchOrders(hubId, { ...query, tab: HubOrderTab.CANCELLED });
  }

  async exportOrders(hubId: string, query: AdminHubOrdersExportQueryDto) {
    await this.assertHubExists(hubId);
    const { orders } = await this.fetchOrders(hubId, {
      ...query,
      page: 1,
      limit: 5000,
    });

    const format = query.format ?? 'csv';
    const headers = [
      'Order ID',
      'Customer Name',
      'Phone',
      'Order Date',
      'Delivery Address',
      'Payment Type',
      'Payment Status',
      'Order Status',
      'Hub',
      'Driver',
      'Vehicle',
      'Total Amount',
      'ETA',
    ];

    const rows = orders.map((order) => [
      order.orderNumber,
      order.customer?.fullName ?? '',
      order.customer?.phone ?? '',
      order.createdAt,
      order.deliveryAddressLabel,
      order.paymentMethod,
      order.paymentStatus,
      order.statusLabel,
      order.hub?.code ?? '',
      order.assignedDriver?.name ?? '',
      order.assignedVehicle?.registration ?? '',
      String(order.grandTotal),
      order.expectedDeliveryAt ?? '',
    ]);

    if (format === 'pdf') {
      const lines = [
        'Hub Orders Export',
        `Generated: ${new Date().toISOString()}`,
        '',
        headers.join(' | '),
        ...rows.map((row) => row.join(' | ')),
      ];
      return {
        contentType: 'application/pdf',
        filename: `hub-${hubId.slice(0, 8)}-orders.pdf`,
        body: Buffer.from(lines.join('\n'), 'utf-8'),
      };
    }

    const csvEscape = (value: string) => {
      const safe = String(value ?? '').replace(/"/g, '""');
      return `"${safe}"`;
    };

    const csvLines = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(',')),
    ];

    const contentType =
      format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';

    const ext = format === 'xlsx' ? 'xlsx' : 'csv';

    return {
      contentType,
      filename: `hub-${hubId.slice(0, 8)}-orders.${ext}`,
      body: Buffer.from(csvLines.join('\n'), 'utf-8'),
    };
  }

  private async fetchOrders(hubId: string, query: AdminHubOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(hubId, query);

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    const [orders, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: ORDER_LIST_INCLUDE,
      }),
      this.prisma.order.count({ where }),
      this.getTabCounts(hubId),
    ]);

    const mapped = orders.map((order) => this.mapOrderRow(order));

    return {
      orders: mapped,
      statusCounts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildWhere(
    hubId: string,
    query: AdminHubOrdersQueryDto,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { hubId, deletedAt: null };

    if (query.tab) {
      this.applyTabFilter(where, query.tab);
    } else if (query.orderStatus) {
      const resolved = resolveStatusInput(query.orderStatus);
      if (resolved) {
        where.orderStatus = resolved;
      } else {
        where.orderStatus = query.orderStatus as OrderStatus;
      }
    } else if (query.statusGroup) {
      where.orderStatus = {
        in: this.statusGroupToStatuses(query.statusGroup),
      };
    }

    if (query.paymentMethod) {
      where.paymentMethod = this.resolvePaymentMethod(query.paymentMethod);
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus.toUpperCase() as PaymentStatus;
    }

    if (query.customerType) {
      where.customer = {
        profile: {
          businessType: { contains: query.customerType, mode: 'insensitive' },
        },
      };
    }

    const dateRange = this.resolveDateRange(query);
    if (dateRange) {
      where.createdAt = dateRange;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { invoice: { invoiceNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private statusGroupToStatuses(group: string): OrderStatus[] {
    return LEGACY_ORDER_GROUP_MAP[group] ?? [];
  }

  private applyTabFilter(where: Prisma.OrderWhereInput, tab: string) {
    switch (tab) {
      case 'active':
        where.orderStatus = { in: ACTIVE_STATUSES };
        break;
      case 'completed':
        where.orderStatus = OrderStatus.DELIVERED;
        break;
      case 'cancelled':
        where.orderStatus = OrderStatus.CANCELLED;
        break;
      case 'pending_dispatch':
        where.orderStatus = { in: PENDING_DISPATCH_STATUSES };
        break;
      case 'out_for_delivery':
        where.orderStatus = { in: OUT_FOR_DELIVERY_STATUSES };
        break;
      default:
        break;
    }
  }

  private resolveDateRange(
    query: AdminHubOrdersQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    const { start: todayStart, end: todayEnd } = getTodayRange();

    switch (query.dateRange) {
      case 'today':
        return { gte: todayStart, lt: todayEnd };
      case 'yesterday': {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 1);
        return { gte: start, lt: todayStart };
      }
      case 'week': {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 6);
        return { gte: start, lt: todayEnd };
      }
      case 'month': {
        const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
        return { gte: start, lt: todayEnd };
      }
      case 'custom':
        if (query.fromDate || query.toDate) {
          return {
            ...(query.fromDate && { gte: new Date(query.fromDate) }),
            ...(query.toDate && { lte: new Date(query.toDate) }),
          };
        }
        return undefined;
      default:
        if (query.fromDate || query.toDate) {
          return {
            ...(query.fromDate && { gte: new Date(query.fromDate) }),
            ...(query.toDate && { lte: new Date(query.toDate) }),
          };
        }
        return undefined;
    }
  }

  private resolvePaymentMethod(input: string): PaymentMethod {
    const normalized = input.toUpperCase().replace(/\s+/g, '_');
    if (normalized === 'CASH') return PaymentMethod.CASH;
    if (normalized === 'UPI' || normalized.startsWith('CREDIT') || normalized === 'ADVANCE') {
      return PaymentMethod.MANUAL;
    }
    return normalized as PaymentMethod;
  }

  private buildOrderBy(
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ): Prisma.OrderOrderByWithRelationInput {
    const direction = sortOrder ?? 'desc';
    switch (sortBy) {
      case 'grandTotal':
        return { grandTotal: direction };
      case 'orderStatus':
        return { orderStatus: direction };
      case 'customerName':
        return { customer: { fullName: direction } };
      default:
        return { createdAt: direction };
    }
  }

  private async getTabCounts(hubId: string) {
    const hubScope = { hubId, deletedAt: null };
    const [all, active, completed, cancelled, pendingDispatch, outForDelivery] =
      await Promise.all([
        this.prisma.order.count({ where: hubScope }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: { in: ACTIVE_STATUSES } },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: OrderStatus.DELIVERED },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: OrderStatus.CANCELLED },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: { in: PENDING_DISPATCH_STATUSES } },
        }),
        this.prisma.order.count({
          where: { ...hubScope, orderStatus: { in: OUT_FOR_DELIVERY_STATUSES } },
        }),
      ]);

    return {
      all,
      active,
      completed,
      cancelled,
      pending_dispatch: pendingDispatch,
      out_for_delivery: outForDelivery,
      pending: await this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: { in: ORDER_STATUS_BUCKETS.pending },
        },
      }),
    };
  }

  private mapOrderRow(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_LIST_INCLUDE }>,
  ) {
    const deliveryJson = order.deliveryAddress as Record<string, string> | null;
    const addressParts = [
      order.address?.line1,
      order.address?.line2,
      order.address?.city,
      order.address?.pincode,
    ].filter(Boolean);
    const deliveryAddressLabel =
      deliveryJson?.address ??
      deliveryJson?.line1 ??
      addressParts.join(', ') ??
      '—';

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      statusLabel: getOrderStatusLabel(order.orderStatus),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      grandTotal: Number(order.grandTotal),
      createdAt: order.createdAt.toISOString(),
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      deliveryAddressLabel,
      deliveryAddress: order.deliveryAddress,
      address: order.address,
      customer: order.customer,
      hub: order.hub,
      assignedDriver: order.assignedDriver,
      assignedVehicle: order.assignedVehicle,
      invoiceId: order.invoice?.id ?? null,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      itemCount: order._count.items,
      deliveryOtpVerified: order.deliveryOtpVerified,
    };
  }

  private withTrend(value: number, previous: number): TrendMetric {
    return {
      value,
      change: value - previous,
      changePercent: this.percentChange(value, previous),
    };
  }

  private percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private async assertHubExists(hubId: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
      select: { id: true },
    });
    if (!hub) throw new NotFoundException('Hub not found');
  }
}
