import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class AdminSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(query: string, limit = 10) {
    if (!query || query.trim().length < 2) {
      return { customers: [], products: [], orders: [], memberships: [], bulk: [] };
    }

    const q = query.trim();

    const [customers, products, orders, memberships, bulk] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { phone: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, phone: true, fullName: true, email: true, status: true },
        take: limit,
      }),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, sku: true, retailPrice: true, entityStatus: true },
        take: limit,
      }),
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          orderNumber: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, orderNumber: true, grandTotal: true, orderStatus: true, createdAt: true },
        take: limit,
      }),
      this.prisma.customerMembership.findMany({
        where: {
          customer: {
            OR: [
              { phone: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        select: {
          id: true,
          status: true,
          expiryDate: true,
          customer: { select: { phone: true, fullName: true } },
          plan: { select: { name: true } },
        },
        take: limit,
      }),
      this.prisma.bulkEnquiry.findMany({
        where: {
          OR: [
            { companyName: { contains: q, mode: 'insensitive' } },
            { projectName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, companyName: true, projectName: true, status: true, createdAt: true },
        take: limit,
      }),
    ]);

    return { customers, products, orders, memberships, bulk };
  }
}
