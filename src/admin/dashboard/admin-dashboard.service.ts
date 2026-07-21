import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

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
      totalWalletBalance,
      loyaltyPointsIssued,
      bulkProcurementRequests,
      emergencyOrders,
      testimonialsCount,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      activeProducts,
      categories,
      activeVideos,
      banners,
      notifications,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { deletedAt: null } }),
      this.prisma.order.count({ where: { deletedAt: null } }),
      this.prisma.order.count({
        where: { createdAt: { gte: today, lt: tomorrow }, deletedAt: null },
      }),
      this.prisma.order.aggregate({
        where: { orderStatus: 'DELIVERED', deletedAt: null },
        _sum: { grandTotal: true },
      }),
      this.prisma.customerMembership.count({ where: { status: 'ACTIVE' } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.loyaltyTransaction.aggregate({
        where: { type: 'EARN' },
        _sum: { points: true },
      }),
      this.prisma.bulkEnquiry.count(),
      this.prisma.emergencyOrder.count(),
      this.prisma.testimonial.count(),
      this.prisma.order.count({ where: { orderStatus: 'PENDING', deletedAt: null } }),
      this.prisma.order.count({ where: { orderStatus: 'DELIVERED', deletedAt: null } }),
      this.prisma.order.count({ where: { orderStatus: 'CANCELLED', deletedAt: null } }),
      this.prisma.product.count({ where: { entityStatus: 'ACTIVE', deletedAt: null } }),
      this.prisma.category.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.video.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.banner.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.notification.count({ where: { deletedAt: null } }),
    ]);

    return {
      customers: {
        total: totalCustomers,
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        pending: pendingOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
      },
      revenue: {
        total: revenue._sum.grandTotal ?? 0,
      },
      memberships: {
        active: membershipCount,
      },
      wallet: {
        totalBalance: totalWalletBalance._sum.balance ?? 0,
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
    };
  }
}
