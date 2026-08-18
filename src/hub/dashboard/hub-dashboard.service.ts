import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { getTodayRange } from '../common/hub-date.util';
import { HubInventoryRepository } from '../repositories/hub-inventory.repository';

@Injectable()
export class HubDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async getDashboard(hubId: string) {
    const { start, end } = getTodayRange();
    const hubScope = { hubId, deletedAt: null };

    const [
      todaysOrders,
      pendingOrders,
      ordersReady,
      ordersLoading,
      ordersDispatched,
      ordersDelivered,
      emergencyOrders,
      bulkOrders,
      inventoryRows,
      vehiclesAvailable,
      driversAvailable,
      todayRevenue,
      deliveredToday,
      dispatchedToday,
      pendingRequisitions,
      incomingTransfers,
      activeRequisitionRows,
      incomingTransferRows,
      warehouse,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { ...hubScope, createdAt: { gte: start, lt: end } },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: {
            in: ['PENDING', 'CONFIRMED', 'HUB_ASSIGNED', 'AWAITING_HUB_ALLOCATION'],
          },
        },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: 'READY_FOR_DISPATCH' },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: { in: ['PROCESSING', 'PACKED'] } },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: 'DISPATCHED' },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: 'DELIVERED' },
      }),
      this.prisma.emergencyOrder.count({
        where: {
          order: hubScope,
          status: { in: ['NEW', 'APPROVED', 'ASSIGNED'] },
        },
      }),
      this.prisma.order.count({
        where: { ...hubScope, bulkOrder: true, orderStatus: { not: 'DELIVERED' } },
      }),
      this.prisma.hubInventory.findMany({
        where: { hubId },
        include: this.inventoryRepo.inventoryInclude(),
      }),
      this.prisma.vehicle.count({
        where: { hubId, status: 'AVAILABLE', isActive: true, deletedAt: null },
      }),
      this.prisma.driver.count({
        where: { hubId, availability: 'AVAILABLE', isActive: true, deletedAt: null },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: { gte: start, lt: end },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.count({
        where: {
          ...hubScope,
          orderStatus: 'DISPATCHED',
          dispatchedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.requisition.count({
        where: {
          hubId,
          status: { in: ['SUBMITTED', 'PENDING_APPROVAL'] },
        },
      }),
      this.prisma.requisition.count({
        where: {
          hubId,
          status: { in: ['DISPATCHED', 'IN_TRANSIT', 'RECEIVED'] },
        },
      }),
      this.prisma.requisition.findMany({
        where: {
          hubId,
          status: {
            in: [
              'SUBMITTED',
              'PENDING_APPROVAL',
              'APPROVED',
              'ALLOCATED',
              'DISPATCHED',
              'IN_TRANSIT',
              'RECEIVED',
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: { items: { take: 1 } },
      }),
      this.prisma.requisition.findMany({
        where: {
          hubId,
          status: { in: ['ALLOCATED', 'DISPATCHED', 'IN_TRANSIT', 'RECEIVED'] },
        },
        orderBy: [{ estimatedArrival: 'asc' }, { dispatchedAt: 'desc' }],
        take: 8,
        include: {
          warehouseHub: { select: { name: true } },
          items: true,
        },
      }),
      this.prisma.hub.findFirst({
        where: {
          deletedAt: null,
          OR: [{ hubType: 'CENTRAL_WAREHOUSE' }, { code: 'WH-GURUGRAM' }],
        },
        select: { id: true, name: true, code: true },
      }),
    ]);

    const inventoryAlerts = inventoryRows
      .map((row) => this.inventoryRepo.mapInventoryRow(row))
      .filter((row) => row.lowStock);

    const totalOrders = todaysOrders || 1;
    const hubPerformance = {
      deliveryRate: Math.round((deliveredToday / totalOrders) * 100),
      dispatchRate: Math.round((dispatchedToday / totalOrders) * 100),
      onTimeDelivery: deliveredToday > 0 ? 92 : 0,
      orderFulfillment: ordersDelivered,
    };

    const STATUS_PROGRESS: Record<string, number> = {
      DRAFT: 0,
      SUBMITTED: 1,
      PENDING_APPROVAL: 1,
      APPROVED: 3,
      ALLOCATED: 4,
      DISPATCHED: 6,
      IN_TRANSIT: 7,
      RECEIVED: 8,
      COMPLETED: 9,
      REJECTED: 2,
    };

    const incomingDeliveries = incomingTransferRows
      .filter((row) => {
        if (row.status === 'COMPLETED' || row.status === 'ALLOCATED') return false;
        if (row.status !== 'RECEIVED') return true;
        return row.items.some((item) => {
          const dispatched = Number(
            item.allocatedQty ?? item.approvedQty ?? item.requestedQty,
          );
          return dispatched > Number(item.receivedQty ?? 0);
        });
      })
      .map((row) => {
        const first = row.items[0];
        const totalQty = row.items.reduce(
          (sum, item) =>
            sum + Number(item.allocatedQty ?? item.approvedQty ?? item.requestedQty),
          0,
        );
        const eta = row.estimatedArrival ?? row.expectedDispatchDate ?? row.dispatchedAt;
        return {
          id: row.id,
          transferId: row.requestNo,
          expectedArrival: eta ? eta.toISOString() : '',
          material:
            row.items.length === 1 && first
              ? first.productName
              : `${row.totalItems} materials`,
          quantity: first
            ? `${totalQty} ${first.unit}`
            : `${totalQty} units`,
          source: row.warehouseHub?.name ?? warehouse?.name ?? 'Central Warehouse',
          status:
            row.status === 'ALLOCATED'
              ? 'pending'
              : row.status === 'RECEIVED' || row.status === 'COMPLETED'
                ? 'delivered'
                : 'dispatch',
          scheduledDate: (
            row.dispatchedAt ??
            row.allocatedAt ??
            row.createdAt
          ).toISOString(),
        };
      });

    const activeRequisitions = activeRequisitionRows.map((row) => {
      const first = row.items[0];
      const progress = STATUS_PROGRESS[row.status] ?? 1;
      return {
        id: row.id,
        code: row.requestNo,
        title:
          first?.productName ??
          `${row.totalItems} material${row.totalItems === 1 ? '' : 's'}`,
        badge: row.priority === 'URGENT' ? 'Urgent' : row.status.replace(/_/g, ' '),
        badgeVariant: row.priority === 'URGENT' ? 'expedited' : 'default',
        progress,
        totalSteps: 9,
        statusText: row.status.replace(/_/g, ' '),
      };
    });

    return {
      todaysOrders,
      pendingOrders,
      ordersReady,
      ordersLoading,
      ordersDispatched,
      ordersDelivered,
      emergencyOrders,
      bulkOrders,
      inventoryAlerts: inventoryAlerts.slice(0, 10),
      inventoryAlertCount: inventoryAlerts.length,
      vehiclesAvailable,
      driversAvailable,
      todaysRevenue: todayRevenue._sum.grandTotal ?? 0,
      hubPerformance,
      warehouseName: warehouse?.name ?? 'Central Warehouse',
      pendingRequisitions,
      incomingTransfers,
      incomingDeliveries,
      activeRequisitions,
    };
  }
}
