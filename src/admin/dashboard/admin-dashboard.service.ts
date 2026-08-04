import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  getOrderStatusLabel,
  ORDER_STATUS_BUCKETS,
} from '../../modules/orders/order-lifecycle.constants';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalCustomers,
      totalOrders,
      todayOrders,
      revenue,
      membershipCount,
      loyaltyPointsIssued,
      bulkProcurementRequests,
      emergencyOrders,
      testimonialsCount,
      pendingOrders,
      acceptedOrders,
      cancelledOrders,
      deliveredOrders,
      dispatchOrders,
      activeProducts,
      categories,
      activeVideos,
      banners,
      notifications,
      activeOffers,
      recentOrders,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.order.count({ where: { deletedAt: null } }),
      this.prisma.order.count({
        where: { createdAt: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
      this.prisma.order.aggregate({
        where: { orderStatus: OrderStatus.DELIVERED, deletedAt: null },
        _sum: { grandTotal: true },
      }),
      this.prisma.customerMembership.count({ where: { status: 'ACTIVE' } }),
      this.prisma.loyaltyTransaction.aggregate({
        where: { type: 'EARN' },
        _sum: { points: true },
      }),
      this.prisma.bulkEnquiry.count(),
      this.prisma.emergencyOrder.count(),
      this.prisma.testimonial.count(),
      this.prisma.order.count({
        where: { orderStatus: { in: ORDER_STATUS_BUCKETS.pending }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: { orderStatus: { in: ORDER_STATUS_BUCKETS.accepted }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: { orderStatus: { in: ORDER_STATUS_BUCKETS.cancelled }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: { orderStatus: OrderStatus.DELIVERED, deletedAt: null },
      }),
      this.prisma.order.count({
        where: { orderStatus: { in: ORDER_STATUS_BUCKETS.dispatch }, deletedAt: null },
      }),
      this.prisma.product.count({
        where: { entityStatus: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.category.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.video.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.banner.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.notification.count({ where: { deletedAt: null } }),
      this.prisma.offer.count({
        where: { status: 'ACTIVE', isVisible: true, deletedAt: null },
      }),
      this.prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          hub: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    return {
      customers: { total: totalCustomers },
      orders: {
        total: totalOrders,
        today: todayOrders,
        pending: pendingOrders,
        processing: acceptedOrders,
        accepted: acceptedOrders,
        readyToDispatch: dispatchOrders,
        completed: deliveredOrders,
        cancelled: cancelledOrders,
        delivered: deliveredOrders,
      },
      revenue: { total: revenue._sum.grandTotal ?? 0 },
      memberships: { active: membershipCount },
      loyalty: { totalPointsIssued: loyaltyPointsIssued._sum.points ?? 0 },
      bulkProcurement: { total: bulkProcurementRequests },
      emergencyOrders: { total: emergencyOrders },
      cms: {
        testimonials: testimonialsCount,
        activeProducts,
        categories,
        activeVideos,
        banners,
        notifications,
        activeOffers,
      },
      recentOrders: recentOrders.map((o) => ({
        ...o,
        statusLabel: getOrderStatusLabel(o.orderStatus),
      })),
    };
  }
}
