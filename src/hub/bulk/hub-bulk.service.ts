import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { HubBulkQueryDto } from '../dto/hub.dto';

@Injectable()
export class HubBulkService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(hubId: string, query: HubBulkQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      bulkOrder: true,
      hubId,
      deletedAt: null,
    };
    if (query.status) where['orderStatus'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          items: {
            include: { product: { select: { name: true, unit: true } } },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(hubId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, hubId, bulkOrder: true, deletedAt: null },
      include: {
        customer: { include: { profile: true } },
        items: { include: { product: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order)
      throw new NotFoundException('Bulk order not found for this hub');
    return order;
  }

  async accept(hubId: string, orderId: string, updatedBy: string) {
    const order = await this.findOne(hubId, orderId);

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        data: { orderStatus: 'PROCESSING' },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: order.id,
          status: 'PROCESSING',
          updatedBy,
          remarks: 'Bulk order accepted by hub',
        },
      }),
    ]);

    return updated;
  }

  async complete(hubId: string, orderId: string, updatedBy: string) {
    const order = await this.findOne(hubId, orderId);

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        data: { orderStatus: 'DELIVERED', deliveredAt: new Date() },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: order.id,
          status: 'DELIVERED',
          updatedBy,
          remarks: 'Bulk order completed',
        },
      }),
    ]);

    return updated;
  }
}
