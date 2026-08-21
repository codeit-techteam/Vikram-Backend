import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EmergencyOrderStatus,
  OrderStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { EmergencyQueryDto } from './dto/admin-emergency.dto';

@Injectable()
export class AdminEmergencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: EmergencyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.emergencyOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priorityLevel: 'desc' }, { createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, phone: true, fullName: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              grandTotal: true,
              orderStatus: true,
            },
          },
        },
      }),
      this.prisma.emergencyOrder.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.emergencyOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        order: {
          include: {
            items: {
              include: { product: { select: { id: true, name: true } } },
            },
            address: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Emergency order not found');
    return order;
  }

  async approve(id: string) {
    await this.findOne(id);
    return this.prisma.emergencyOrder.update({
      where: { id },
      data: { status: EmergencyOrderStatus.APPROVED },
    });
  }

  async reject(id: string) {
    await this.findOne(id);
    return this.prisma.emergencyOrder.update({
      where: { id },
      data: { status: EmergencyOrderStatus.REJECTED },
    });
  }

  async assignHub(id: string, hubId: string) {
    const emergency = await this.findOne(id);
    await this.prisma.order.update({
      where: { id: emergency.orderId },
      data: { hubId },
    });
    return this.prisma.emergencyOrder.update({
      where: { id },
      data: { status: EmergencyOrderStatus.ASSIGNED },
    });
  }

  async markDelivered(id: string) {
    const emergency = await this.findOne(id);
    await this.prisma.order.update({
      where: { id: emergency.orderId },
      data: { orderStatus: OrderStatus.DELIVERED, deliveredAt: new Date() },
    });
    return this.prisma.emergencyOrder.update({
      where: { id },
      data: { status: EmergencyOrderStatus.COMPLETED },
    });
  }
}
