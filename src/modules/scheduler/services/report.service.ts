import { Injectable, Logger } from '@nestjs/common';
import {
  LoyaltyTransactionType,
  OrderStatus,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  dayKey,
  endOfDay,
  previousDay,
  startOfDay,
  toDateOnly,
} from '../scheduler.utils';
import type { JobRunResult } from './scheduler-log.service';

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateDailyReport(reportDate?: Date): Promise<JobRunResult> {
    const target = reportDate ?? previousDay();
    const from = startOfDay(target);
    const to = endOfDay(target);
    const dateOnly = toDateOnly(target);

    this.logger.log(`Generating daily report for ${dayKey(target)}`);

    const [
      ordersTotal,
      revenueAgg,
      cancelledOrders,
      pendingOrders,
      deliveredOrders,
      membershipPurchases,
      membershipSales,
      loyaltyEarned,
      loyaltyRedeemed,
      newCustomers,
      bulkProcurementRequests,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { deletedAt: null, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.order.aggregate({
        where: {
          deletedAt: null,
          orderStatus: { not: OrderStatus.CANCELLED },
          createdAt: { gte: from, lte: to },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.CANCELLED,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.PENDING,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          orderStatus: OrderStatus.DELIVERED,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.customerMembership.count({
        where: { purchaseDate: { gte: from, lte: to } },
      }),
      this.prisma.customerMembership.findMany({
        where: { purchaseDate: { gte: from, lte: to } },
        include: { plan: { select: { price: true } } },
      }),
      this.prisma.loyaltyTransaction.aggregate({
        where: {
          type: LoyaltyTransactionType.EARN,
          createdAt: { gte: from, lte: to },
        },
        _sum: { points: true },
      }),
      this.prisma.loyaltyTransaction.aggregate({
        where: {
          type: LoyaltyTransactionType.REDEEM,
          createdAt: { gte: from, lte: to },
        },
        _sum: { points: true },
      }),
      this.prisma.customer.count({
        where: { deletedAt: null, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.bulkEnquiry.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
    ]);

    const membershipSalesAmount = membershipSales.reduce(
      (sum, m) => sum + Number(m.plan.price),
      0,
    );

    const metrics = {
      orders: ordersTotal,
      revenue: Number(revenueAgg._sum.grandTotal ?? 0),
      cancelledOrders,
      pendingOrders,
      deliveredOrders,
      membershipPurchases,
      membershipSalesAmount,
      loyaltyEarned: loyaltyEarned._sum.points ?? 0,
      loyaltyRedeemed: loyaltyRedeemed._sum.points ?? 0,
      newCustomers,
      bulkProcurementRequests,
    };

    await this.prisma.dailyBusinessReport.upsert({
      where: { date: dateOnly },
      create: {
        date: dateOnly,
        orders: metrics.orders,
        revenue: metrics.revenue,
        cancelledOrders: metrics.cancelledOrders,
        pendingOrders: metrics.pendingOrders,
        deliveredOrders: metrics.deliveredOrders,
        membershipPurchases: metrics.membershipPurchases,
        membershipSalesAmount: metrics.membershipSalesAmount,
        loyaltyEarned: metrics.loyaltyEarned,
        loyaltyRedeemed: metrics.loyaltyRedeemed,
        newCustomers: metrics.newCustomers,
        bulkProcurementRequests: metrics.bulkProcurementRequests,
        metrics,
      },
      update: {
        orders: metrics.orders,
        revenue: metrics.revenue,
        cancelledOrders: metrics.cancelledOrders,
        pendingOrders: metrics.pendingOrders,
        deliveredOrders: metrics.deliveredOrders,
        membershipPurchases: metrics.membershipPurchases,
        membershipSalesAmount: metrics.membershipSalesAmount,
        loyaltyEarned: metrics.loyaltyEarned,
        loyaltyRedeemed: metrics.loyaltyRedeemed,
        newCustomers: metrics.newCustomers,
        bulkProcurementRequests: metrics.bulkProcurementRequests,
        metrics,
      },
    });

    return {
      processedCount: 1,
      successCount: 1,
      failedCount: 0,
      metadata: {
        reportDate: dayKey(target),
        ...metrics,
      },
    };
  }
}
