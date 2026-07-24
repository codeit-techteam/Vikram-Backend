import { Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

const PENDING_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.HUB_ASSIGNED,
  OrderStatus.AWAITING_HUB_ALLOCATION,
];

const PROCESSING_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
];

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
      processingOrders,
      readyToDispatch,
      completedOrders,
      cancelledOrders,
      activeProducts,
      categories,
      activeVideos,
      banners,
      notifications,
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
        where: { orderStatus: { in: PENDING_ORDER_STATUSES }, deletedAt: null },
      }),
      this.prisma.order.count({
        where: {
          orderStatus: { in: PROCESSING_ORDER_STATUSES },
          deletedAt: null,
        },
      }),
      this.prisma.order.count({
        where: {
          orderStatus: OrderStatus.READY_FOR_DISPATCH,
          deletedAt: null,
        },
      }),
      this.prisma.order.count({
        where: { orderStatus: OrderStatus.DELIVERED, deletedAt: null },
      }),
      this.prisma.order.count({
        where: { orderStatus: OrderStatus.CANCELLED, deletedAt: null },
      }),
      this.prisma.product.count({
        where: { entityStatus: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.category.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.video.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.banner.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.notification.count({ where: { deletedAt: null } }),
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
      customers: {
        total: totalCustomers,
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        pending: pendingOrders,
        processing: processingOrders,
        readyToDispatch,
        completed: completedOrders,
        cancelled: cancelledOrders,
      },
      revenue: {
        total: revenue._sum.grandTotal ?? 0,
      },
      memberships: {
        active: membershipCount,
      },
      loyalty: {
        totalPointsIssued: loyaltyPointsIssued._sum.points ?? 0,
      },
      bulkProcurement: {
        total: bulkProcurementRequests,
      },
      emergencyOrders: {
        total: emergencyOrders,
      },
      cms: {
        testimonials: testimonialsCount,
        activeProducts,
        categories,
        activeVideos,
        banners,
        notifications,
      },
      recentOrders,
    };
  }
}
