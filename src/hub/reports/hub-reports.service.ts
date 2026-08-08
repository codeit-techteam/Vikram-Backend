import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import {
  formatIstDateTime,
  resolvePeriodRange,
  startOfDayIst,
  addDays,
} from '../common/hub-date.util';
import type { HubReportsQueryDto } from '../dto/hub.dto';

const CONSUMPTION_COLORS = [
  '#FF6B00',
  '#FF8C33',
  '#FFB366',
  '#FFD199',
  '#E55F00',
  '#CC5500',
];

const STOCK_IN_TYPES = [
  'REQUISITION_RECEIVE',
  'TRANSFER',
] as const;

const CONSUME_TYPES = ['ORDER_CONSUME'] as const;

@Injectable()
export class HubReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(hubId: string, query: HubReportsQueryDto) {
    const from = query.fromDate ?? query.from;
    const to = query.toDate ?? query.to;
    const { start, end, period } = resolvePeriodRange(query.period, from, to);
    const dateRange = { gte: start, lt: end };
    const hubScope = { hubId, deletedAt: null as Date | null };

    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });

    const [
      overview,
      inventoryTrends,
      consumption,
      requisitionVolume,
      deliveryPerformance,
      movementLogs,
    ] = await Promise.all([
      this.buildKpis(hubId, hubScope, dateRange),
      this.buildInventoryTrends(hubId, start, end, period),
      this.buildProductConsumption(hubId, dateRange),
      this.buildRequisitionVolume(hubId, start, end, period),
      this.buildDeliveryPerformance(hubId, hubScope, dateRange),
      this.buildLogisticsStream(hubId, dateRange),
    ]);

    return {
      hub: hub
        ? { id: hub.id, name: hub.name, code: hub.code }
        : { id: hubId, name: 'Hub', code: '' },
      period: {
        from: start.toISOString(),
        to: end.toISOString(),
        preset: period,
        lastUpdated: formatIstDateTime(),
      },
      // Shape expected by Hub Panel AnalyticsDashboardData
      overview,
      inventoryTrends,
      consumption,
      requisitionVolume,
      deliveryPerformance,
      movementLogs,
      hubOptions: hub
        ? [{ value: hub.id, label: hub.name }]
        : [{ value: hubId, label: 'Assigned Hub' }],
      lastUpdated: formatIstDateTime(),
      // Keep legacy fields for any older consumers
      dateRange: { from: start, to: end },
      hubPerformance: {
        fulfillmentRate:
          overview.fulfillmentRate === '--'
            ? 0
            : Number(String(overview.fulfillmentRate).replace('%', '')),
      },
    };
  }

  private formatRevenue(amount: number): string {
    if (!amount || amount <= 0) return '₹0';
    if (amount >= 1_00_00_000) {
      return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
    }
    if (amount >= 1_00_000) {
      return `₹${(amount / 1_00_000).toFixed(1)}L`;
    }
    return `₹${amount.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  }

  private async buildKpis(
    hubId: string,
    hubScope: { hubId: string; deletedAt: Date | null },
    dateRange: { gte: Date; lt: Date },
  ) {
    const [
      eligibleOrders,
      deliveredOrders,
      revenueAgg,
      deliverySamples,
      consumeAgg,
      inventoryRows,
      receiveItems,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          ...hubScope,
          createdAt: dateRange,
          orderStatus: { not: 'CANCELLED' },
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: dateRange,
        },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: dateRange,
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: dateRange,
          dispatchedAt: { not: null },
        },
        select: { dispatchedAt: true, deliveredAt: true },
        take: 2000,
      }),
      this.prisma.inventoryLedgerEntry.aggregate({
        where: {
          hubId,
          type: { in: [...CONSUME_TYPES] },
          createdAt: dateRange,
        },
        _sum: { quantity: true },
      }),
      this.prisma.hubInventory.findMany({
        where: { hubId },
        select: { availableQty: true, reservedQty: true },
      }),
      this.prisma.requisitionItem.findMany({
        where: {
          requisition: {
            hubId,
            status: 'COMPLETED',
            updatedAt: dateRange,
          },
          OR: [
            { shortageQty: { gt: 0 } },
            { damageQty: { gt: 0 } },
            { missingQty: { gt: 0 } },
            { receivedQty: { not: null } },
          ],
        },
        select: {
          receivedQty: true,
          allocatedQty: true,
          approvedQty: true,
          shortageQty: true,
          damageQty: true,
          missingQty: true,
        },
      }),
    ]);

    // Fulfillment
    const fulfillmentRate =
      eligibleOrders > 0
        ? `${((deliveredOrders / eligibleOrders) * 100).toFixed(1)}%`
        : '--';

    // Avg delivery time (dispatched → delivered)
    let avgDeliveryTime = '--';
    if (deliverySamples.length > 0) {
      const totalHours = deliverySamples.reduce((sum, o) => {
        const start = o.dispatchedAt!.getTime();
        const end = o.deliveredAt!.getTime();
        return sum + Math.max(0, end - start) / (1000 * 60 * 60);
      }, 0);
      const avg = totalHours / deliverySamples.length;
      avgDeliveryTime = `${(Math.round(avg * 10) / 10).toFixed(1)} hrs`;
    }

    // Revenue
    const revenue = this.formatRevenue(Number(revenueAgg._sum.grandTotal ?? 0));

    // Inventory turnover = consumed / average on-hand
    let consumed = Math.abs(Number(consumeAgg._sum.quantity ?? 0));
    if (consumed <= 0) {
      const itemConsume = await this.prisma.orderItem.aggregate({
        where: {
          order: {
            hubId,
            deletedAt: null,
            orderStatus: 'DELIVERED',
            deliveredAt: dateRange,
          },
        },
        _sum: { quantity: true },
      });
      consumed = Number(itemConsume._sum.quantity ?? 0);
    }
    const avgOnHand =
      inventoryRows.length > 0
        ? inventoryRows.reduce(
            (s, r) => s + (r.availableQty + r.reservedQty),
            0,
          ) / inventoryRows.length
        : 0;
    const inventoryTurnover =
      avgOnHand > 0 && consumed > 0
        ? `${(consumed / avgOnHand).toFixed(1)}x`
        : '--';

    // Stock accuracy from requisition receive variance
    let stockAccuracy = '--';
    if (receiveItems.length > 0) {
      let expected = 0;
      let variance = 0;
      for (const item of receiveItems) {
        const base =
          item.allocatedQty ?? item.approvedQty ?? item.receivedQty ?? 0;
        expected += base;
        variance +=
          (item.shortageQty ?? 0) +
          (item.damageQty ?? 0) +
          (item.missingQty ?? 0);
      }
      if (expected > 0) {
        const accuracy = Math.max(0, 1 - variance / expected) * 100;
        stockAccuracy = `${accuracy.toFixed(1)}%`;
      }
    }

    return {
      inventoryTurnover,
      fulfillmentRate,
      avgDeliveryTime,
      stockAccuracy,
      revenue,
    };
  }

  private async buildInventoryTrends(
    hubId: string,
    start: Date,
    end: Date,
    period: string,
  ) {
    const dateRange = { gte: start, lt: end };
    const [entries, deliveredItems] = await Promise.all([
      this.prisma.inventoryLedgerEntry.findMany({
        where: {
          hubId,
          createdAt: dateRange,
          type: { in: [...STOCK_IN_TYPES, ...CONSUME_TYPES] },
        },
        select: { type: true, quantity: true, createdAt: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            hubId,
            deletedAt: null,
            orderStatus: 'DELIVERED',
            deliveredAt: dateRange,
          },
        },
        select: {
          quantity: true,
          order: { select: { deliveredAt: true } },
        },
      }),
    ]);

    const buckets = this.buildTimeBuckets(start, end, period);
    for (const e of entries) {
      const key = this.bucketKey(e.createdAt, buckets, period);
      if (!key) continue;
      const b = buckets.find((x) => x.key === key);
      if (!b) continue;
      if ((STOCK_IN_TYPES as readonly string[]).includes(e.type)) {
        b.stockIn += Math.abs(e.quantity);
      } else if ((CONSUME_TYPES as readonly string[]).includes(e.type)) {
        b.consumption += Math.abs(e.quantity);
      }
    }

    // Fallback consumption from delivered order items when ORDER_CONSUME
    // ledger rows are not yet written by order flows.
    const hasLedgerConsume = entries.some((e) =>
      (CONSUME_TYPES as readonly string[]).includes(e.type),
    );
    if (!hasLedgerConsume) {
      for (const item of deliveredItems) {
        const at = item.order.deliveredAt;
        if (!at) continue;
        const key = this.bucketKey(at, buckets, period);
        const b = buckets.find((x) => x.key === key);
        if (b) b.consumption += item.quantity;
      }
    }

    return buckets.map((b) => ({
      name: b.label,
      stockIn: b.stockIn,
      consumption: b.consumption,
    }));
  }

  private buildTimeBuckets(start: Date, end: Date, period: string) {
    const ms = end.getTime() - start.getTime();
    const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));

    // Daily for short ranges
    if (period === 'last_7_days' || period === 'today' || days <= 14) {
      const buckets: {
        key: string;
        label: string;
        start: Date;
        end: Date;
        stockIn: number;
        consumption: number;
      }[] = [];
      let cursor = startOfDayIst(start);
      let i = 0;
      while (cursor < end && i < 40) {
        const next = addDays(cursor, 1);
        const label = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
        }).format(cursor);
        buckets.push({
          key: cursor.toISOString(),
          label,
          start: cursor,
          end: next,
          stockIn: 0,
          consumption: 0,
        });
        cursor = next;
        i += 1;
      }
      return buckets;
    }

    // Weekly buckets (default for 30/90 days)
    const weekCount = Math.min(12, Math.max(4, Math.ceil(days / 7)));
    const weekMs = Math.ceil(ms / weekCount);
    const buckets: {
      key: string;
      label: string;
      start: Date;
      end: Date;
      stockIn: number;
      consumption: number;
    }[] = [];
    for (let i = 0; i < weekCount; i++) {
      const bStart = new Date(start.getTime() + i * weekMs);
      const bEnd =
        i === weekCount - 1
          ? end
          : new Date(start.getTime() + (i + 1) * weekMs);
      buckets.push({
        key: `w${i + 1}`,
        label: `Week ${i + 1}`,
        start: bStart,
        end: bEnd,
        stockIn: 0,
        consumption: 0,
      });
    }
    return buckets;
  }

  private bucketKey(
    date: Date,
    buckets: { key: string; start: Date; end: Date }[],
    _period: string,
  ): string | null {
    for (const b of buckets) {
      if (date >= b.start && date < b.end) return b.key;
    }
    return null;
  }

  private async buildProductConsumption(
    hubId: string,
    dateRange: { gte: Date; lt: Date },
  ) {
    // Prefer order items on delivered orders in range
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          hubId,
          deletedAt: null,
          orderStatus: 'DELIVERED',
          deliveredAt: dateRange,
        },
      },
      select: {
        quantity: true,
        category: true,
        name: true,
        product: { select: { name: true, category: { select: { name: true } } } },
      },
    });

    const map = new Map<string, number>();
    for (const item of items) {
      const label =
        item.category ||
        item.product?.category?.name ||
        item.product?.name ||
        item.name ||
        'Other';
      map.set(label, (map.get(label) ?? 0) + item.quantity);
    }

    // Fallback to ledger consume if no delivered order items
    if (map.size === 0) {
      const ledger = await this.prisma.inventoryLedgerEntry.findMany({
        where: {
          hubId,
          type: 'ORDER_CONSUME',
          createdAt: dateRange,
        },
        select: {
          quantity: true,
          product: { select: { name: true, category: { select: { name: true } } } },
        },
      });
      for (const e of ledger) {
        const label = e.product.category?.name || e.product.name || 'Other';
        map.set(label, (map.get(label) ?? 0) + Math.abs(e.quantity));
      }
    }

    const total = [...map.values()].reduce((s, v) => s + v, 0);
    if (total <= 0) return [];

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, qty], i) => ({
        name,
        percentage: Math.round((qty / total) * 1000) / 10,
        quantity: qty,
        color: CONSUMPTION_COLORS[i % CONSUMPTION_COLORS.length],
      }));
  }

  private async buildRequisitionVolume(
    hubId: string,
    start: Date,
    end: Date,
    period: string,
  ) {
    const [totalRequests, completed, allInRange] = await Promise.all([
      this.prisma.requisition.count({
        where: {
          hubId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.requisition.count({
        where: {
          hubId,
          status: 'COMPLETED',
          updatedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.requisition.findMany({
        where: {
          hubId,
          createdAt: { gte: start, lt: end },
        },
        select: { createdAt: true },
      }),
    ]);

    const buckets = this.buildTimeBuckets(start, end, period);
    for (const r of allInRange) {
      const key = this.bucketKey(r.createdAt, buckets, period);
      const b = buckets.find((x) => x.key === key);
      if (b) b.stockIn += 1; // reuse stockIn field as count
    }

    return {
      totalRequests,
      completed,
      monthly: buckets.map((b) => ({
        name: b.label,
        value: b.stockIn,
      })),
    };
  }

  private async buildDeliveryPerformance(
    hubId: string,
    hubScope: { hubId: string; deletedAt: Date | null },
    dateRange: { gte: Date; lt: Date },
  ) {
    const delivered = await this.prisma.order.findMany({
      where: {
        ...hubScope,
        orderStatus: 'DELIVERED',
        deliveredAt: dateRange,
      },
      select: {
        deliveredAt: true,
        expectedDeliveryAt: true,
        dispatchedAt: true,
      },
      take: 5000,
    });

    if (delivered.length === 0) {
      return {
        onTime: 0,
        minorDelay: 0,
        criticalDelay: 0,
        avgLagHours: 0,
        totalDelivered: 0,
        empty: true,
      };
    }

    let onTime = 0;
    let minorDelay = 0;
    let criticalDelay = 0;
    let lagSumHours = 0;
    let lagCount = 0;

    for (const o of delivered) {
      const deliveredAt = o.deliveredAt!;
      // Prefer expectedDeliveryAt; else treat dispatched+4h as soft SLA
      const expected =
        o.expectedDeliveryAt ??
        (o.dispatchedAt
          ? new Date(o.dispatchedAt.getTime() + 4 * 60 * 60 * 1000)
          : null);

      if (o.dispatchedAt) {
        const hours =
          (deliveredAt.getTime() - o.dispatchedAt.getTime()) /
          (1000 * 60 * 60);
        if (hours >= 0) {
          lagSumHours += hours;
          lagCount += 1;
        }
      }

      if (!expected) {
        onTime += 1;
        continue;
      }

      const delayHours =
        (deliveredAt.getTime() - expected.getTime()) / (1000 * 60 * 60);
      if (delayHours <= 0) onTime += 1;
      else if (delayHours <= 2) minorDelay += 1;
      else if (delayHours > 4) criticalDelay += 1;
      else minorDelay += 1; // 2–4h counted as minor for donut completeness
    }

    const total = delivered.length;
    const avgLagHours =
      lagCount > 0 ? Math.round((lagSumHours / lagCount) * 10) / 10 : 0;

    return {
      onTime: Math.round((onTime / total) * 1000) / 10,
      minorDelay: Math.round((minorDelay / total) * 1000) / 10,
      criticalDelay: Math.round((criticalDelay / total) * 1000) / 10,
      avgLagHours,
      totalDelivered: total,
      empty: false,
    };
  }

  private async buildLogisticsStream(
    hubId: string,
    dateRange: { gte: Date; lt: Date },
  ) {
    const dispatches = await this.prisma.hubDispatch.findMany({
      where: {
        hubId,
        OR: [
          { createdAt: dateRange },
          { dispatchedAt: dateRange },
          { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            expectedDeliveryAt: true,
            deliveryAddress: true,
            address: {
              select: {
                line1: true,
                line2: true,
                city: true,
                landmark: true,
              },
            },
            items: {
              select: { name: true, quantity: true },
              take: 3,
            },
          },
        },
        vehicle: { select: { registration: true } },
      },
    });

    if (dispatches.length > 0) {
      return dispatches.map((d) => {
        const material =
          d.order.items.map((i) => i.name).join(', ') ||
          d.order.orderNumber ||
          '—';
        const destination = this.formatDestination(
          d.order.deliveryAddress,
          d.order.address,
        );
        const etaDate = d.estimatedEtaAt || d.order.expectedDeliveryAt;
        const eta = etaDate
          ? new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: 'short',
              hour12: false,
            }).format(etaDate)
          : '—';

        return {
          id: d.order.id,
          shipmentId:
            d.trackingNo ||
            d.dispatchNo ||
            d.vehicle?.registration ||
            d.id.slice(0, 8),
          material:
            material.length > 48 ? `${material.slice(0, 45)}…` : material,
          destination:
            destination.length > 48
              ? `${destination.slice(0, 45)}…`
              : destination,
          eta,
          status: this.mapLogisticsStatus(d.status, d.order.orderStatus),
          actionType: 'map' as const,
          orderId: d.order.id,
          orderNumber: d.order.orderNumber,
        };
      });
    }

    // Fallback: active / recent hub orders when no dispatch rows exist yet
    const orders = await this.prisma.order.findMany({
      where: {
        hubId,
        deletedAt: null,
        OR: [
          {
            orderStatus: {
              in: [
                'ACCEPTED_BY_HUB',
                'PICKING',
                'PROCESSING',
                'PACKED',
                'READY_FOR_DISPATCH',
                'DRIVER_ASSIGNED',
                'OUT_FOR_DELIVERY',
                'DISPATCHED',
              ],
            },
          },
          {
            orderStatus: 'DELIVERED',
            deliveredAt: dateRange,
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        expectedDeliveryAt: true,
        deliveryAddress: true,
        address: {
          select: {
            line1: true,
            line2: true,
            city: true,
            landmark: true,
          },
        },
        items: {
          select: { name: true, quantity: true },
          take: 3,
        },
      },
    });

    return orders.map((o) => {
      const material =
        o.items.map((i) => i.name).join(', ') || o.orderNumber || '—';
      const destination = this.formatDestination(o.deliveryAddress, o.address);
      const eta = o.expectedDeliveryAt
        ? new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short',
            hour12: false,
          }).format(o.expectedDeliveryAt)
        : '—';

      return {
        id: o.id,
        shipmentId: o.orderNumber,
        material:
          material.length > 48 ? `${material.slice(0, 45)}…` : material,
        destination:
          destination.length > 48
            ? `${destination.slice(0, 45)}…`
            : destination,
        eta,
        status: this.mapLogisticsStatus('PENDING', o.orderStatus),
        actionType: 'map' as const,
        orderId: o.id,
        orderNumber: o.orderNumber,
      };
    });
  }

  private mapLogisticsStatus(
    dispatchStatus: string,
    orderStatus: string,
  ): 'pending' | 'loading' | 'dispatch' | 'delivered' {
    if (orderStatus === 'DELIVERED' || dispatchStatus === 'COMPLETED') {
      return 'delivered';
    }
    if (
      orderStatus === 'OUT_FOR_DELIVERY' ||
      orderStatus === 'DISPATCHED' ||
      orderStatus === 'DRIVER_ASSIGNED'
    ) {
      return 'dispatch';
    }
    if (
      orderStatus === 'PICKING' ||
      orderStatus === 'PROCESSING' ||
      orderStatus === 'PACKED' ||
      dispatchStatus === 'IN_PROGRESS'
    ) {
      return 'loading';
    }
    return 'pending';
  }

  private formatDestination(
    deliveryAddress: unknown,
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      landmark?: string | null;
    } | null,
  ): string {
    if (deliveryAddress && typeof deliveryAddress === 'object') {
      const a = deliveryAddress as Record<string, unknown>;
      const parts = [
        a.siteName,
        a.line1 ?? a.addressLine1,
        a.landmark,
        a.city,
      ]
        .filter((x) => typeof x === 'string' && x.trim())
        .map(String);
      if (parts.length) return parts.join(', ');
    }
    if (address) {
      const parts = [
        address.line1,
        address.line2,
        address.landmark,
        address.city,
      ].filter((x) => x && String(x).trim());
      if (parts.length) return parts.join(', ');
    }
    return '—';
  }
}
