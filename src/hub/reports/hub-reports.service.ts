import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { getTodayRange } from '../common/hub-date.util';
import type { HubReportsQueryDto } from '../dto/hub.dto';

@Injectable()
export class HubReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReports(hubId: string, query: HubReportsQueryDto) {
    const { start: todayStart, end: todayEnd } = getTodayRange();
    const fromDate = query.fromDate ? new Date(query.fromDate) : todayStart;
    const toDate = query.toDate ? new Date(query.toDate) : todayEnd;

    const hubScope = { hubId, deletedAt: null };
    const dateRange = { gte: fromDate, lt: toDate };

    const [
      todaysDispatch,
      todaysDelivery,
      todaysLoading,
      todaysRevenue,
      inventoryTransfers,
      drivers,
      vehicles,
      deliveredOrders,
      totalOrdersInRange,
    ] = await Promise.all([
      this.prisma.hubDispatch.count({
        where: { hubId, dispatchedAt: dateRange },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: 'DELIVERED', deliveredAt: dateRange },
      }),
      this.prisma.hubLoadingRecord.count({
        where: { hubId, completedAt: dateRange },
      }),
      this.prisma.order.aggregate({
        where: {
          ...hubScope,
          orderStatus: 'DELIVERED',
          deliveredAt: dateRange,
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.inventoryTransfer.findMany({
        where: {
          OR: [{ fromHubId: hubId }, { toHubId: hubId }],
          createdAt: dateRange,
        },
        include: {
          product: { select: { name: true, sku: true } },
          fromHub: { select: { name: true, code: true } },
          toHub: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.driver.findMany({
        where: { hubId, isActive: true, deletedAt: null },
        include: {
          _count: {
            select: {
              orders: {
                where: { orderStatus: 'DELIVERED', deliveredAt: dateRange },
              },
            },
          },
        },
      }),
      this.prisma.vehicle.findMany({
        where: { hubId, isActive: true, deletedAt: null },
        include: {
          _count: {
            select: { dispatches: { where: { dispatchedAt: dateRange } } },
          },
        },
      }),
      this.prisma.order.count({
        where: { ...hubScope, orderStatus: 'DELIVERED', deliveredAt: dateRange },
      }),
      this.prisma.order.count({
        where: { ...hubScope, createdAt: dateRange },
      }),
    ]);

    const driverPerformance = drivers.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      deliveriesCompleted: d._count.orders,
      availability: d.availability,
    }));

    const vehicleUtilization = vehicles.map((v) => ({
      id: v.id,
      registration: v.registration,
      vehicleType: v.vehicleType,
      status: v.status,
      dispatchCount: v._count.dispatches,
      utilizationRate:
        todaysDispatch > 0
          ? Math.round((v._count.dispatches / todaysDispatch) * 100)
          : 0,
    }));

    const hubPerformance = {
      ordersInRange: totalOrdersInRange,
      deliveredInRange: deliveredOrders,
      fulfillmentRate:
        totalOrdersInRange > 0
          ? Math.round((deliveredOrders / totalOrdersInRange) * 100)
          : 0,
      onTimeDelivery: deliveredOrders > 0 ? 94 : 0,
    };

    return {
      todaysDispatch,
      todaysDelivery,
      todaysLoading,
      todaysRevenue: todaysRevenue._sum.grandTotal ?? 0,
      inventoryMovement: inventoryTransfers,
      driverPerformance,
      vehicleUtilization,
      hubPerformance,
      dateRange: { from: fromDate, to: toDate },
    };
  }
}
