import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { AdminOrderQueryDto, UpdateOrderStatusDto, CancelOrderDto } from './dto/admin-orders.dto';

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) where['orderStatus'] = query.status;
    if (query.customerId) where['customerId'] = query.customerId;
    if (query.hubId) where['hubId'] = query.hubId;
    if (query.fromDate || query.toDate) {
      where['createdAt'] = {
        ...(query.fromDate && { gte: new Date(query.fromDate) }),
        ...(query.toDate && { lte: new Date(query.toDate) }),
      };
    }
    if (query.search) {
      where['orderNumber'] = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          hub: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: { include: { profile: true } },
        address: true,
        hub: true,
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        timeline: { orderBy: { createdAt: 'asc' } },
        invoice: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, updatedBy: string) {
    const order = await this.findOne(id);
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { orderStatus: (dto.status as any) },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: (dto.status as any),
          remarks: dto.remarks,
          updatedBy,
        },
      }),
    ]);
    return updated;
  }

  async assignHub(id: string, hubId: string) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: { hubId, orderStatus: 'HUB_ASSIGNED' },
    });
  }

  async cancelOrder(id: string, dto: CancelOrderDto, updatedBy: string) {
    await this.findOne(id);
    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: { orderStatus: 'CANCELLED', cancelReason: dto.reason, cancelledAt: new Date() },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: id,
          status: 'CANCELLED',
          remarks: dto.reason,
          updatedBy,
        },
      }),
    ]);
    return updated;
  }

  async getTimeline(id: string) {
    await this.findOne(id);
    return this.prisma.orderTimeline.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
    });
  }
}
