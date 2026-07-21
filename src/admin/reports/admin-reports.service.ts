import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

interface ReportParams {
  fromDate?: string;
  toDate?: string;
  groupBy?: 'day' | 'month';
}

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private getDateFilter(params: ReportParams) {
    if (!params.fromDate && !params.toDate) return undefined;
    return {
      ...(params.fromDate && { gte: new Date(params.fromDate) }),
      ...(params.toDate && { lte: new Date(params.toDate) }),
    };
  }

  async revenueReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = { orderStatus: 'DELIVERED', deletedAt: null };
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, orders] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _sum: { grandTotal: true, deliveryCharge: true, discountAmount: true, gstAmount: true },
        _count: { _all: true },
        _avg: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where,
        select: {
          orderNumber: true,
          grandTotal: true,
          gstAmount: true,
          discountAmount: true,
          paymentMethod: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, orders };
  }

  async membershipReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = {};
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, memberships] = await Promise.all([
      this.prisma.customerMembership.groupBy({
        by: ['status'],
        _count: { _all: true },
        where,
      }),
      this.prisma.customerMembership.findMany({
        where,
        include: {
          customer: { select: { phone: true, fullName: true } },
          plan: { select: { name: true, price: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, memberships };
  }

  async walletReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = {};
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, transactions] = await Promise.all([
      this.prisma.walletTransaction.groupBy({
        by: ['type'],
        _count: { _all: true },
        where,
      }),
      this.prisma.walletTransaction.findMany({
        where,
        include: { wallet: { include: { customer: { select: { phone: true, fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, transactions };
  }

  async bulkReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = {};
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, enquiries] = await Promise.all([
      this.prisma.bulkEnquiry.groupBy({
        by: ['status'],
        _count: { _all: true },
        where,
      }),
      this.prisma.bulkEnquiry.findMany({
        where,
        include: { customer: { select: { phone: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, enquiries };
  }

  async ordersReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = { deletedAt: null };
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, orders] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['orderStatus'],
        _count: { _all: true },
        _sum: { grandTotal: true },
        where,
      }),
      this.prisma.order.findMany({
        where,
        select: {
          orderNumber: true,
          orderStatus: true,
          grandTotal: true,
          paymentMethod: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, orders };
  }

  async customersReport(params: ReportParams) {
    const dateFilter = this.getDateFilter(params);
    const where: Record<string, unknown> = { deletedAt: null };
    if (dateFilter) where['createdAt'] = dateFilter;

    const [summary, customers] = await Promise.all([
      this.prisma.customer.groupBy({
        by: ['status'],
        _count: { _all: true },
        where,
      }),
      this.prisma.customer.findMany({
        where,
        select: {
          phone: true,
          fullName: true,
          email: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return { summary, customers };
  }
}
