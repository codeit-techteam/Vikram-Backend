import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type { HubEmergencyPriorityDto, HubEmergencyQueryDto } from '../dto/hub.dto';

@Injectable()
export class HubEmergencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
  ) {}

  async findAll(hubId: string, query: HubEmergencyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      order: { hubId, deletedAt: null },
    };
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.emergencyOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priorityLevel: 'desc' }, { createdAt: 'desc' }],
        include: {
          order: {
            include: {
              customer: { select: { id: true, fullName: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.emergencyOrder.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async accept(hubId: string, id: string, updatedBy: string) {
    const emergency = await this.findHubEmergency(id, hubId);

    await this.prisma.$transaction([
      this.prisma.emergencyOrder.update({
        where: { id },
        data: { status: 'ASSIGNED' },
      }),
      this.prisma.order.update({
        where: { id: emergency.orderId },
        data: { orderStatus: 'PROCESSING', priorityOrder: true },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: emergency.orderId,
          status: 'PROCESSING',
          updatedBy,
          remarks: 'Emergency order accepted by hub',
        },
      }),
    ]);

    return this.findHubEmergency(id, hubId);
  }

  async setPriority(hubId: string, id: string, dto: HubEmergencyPriorityDto) {
    await this.findHubEmergency(id, hubId);

    const updated = await this.prisma.emergencyOrder.update({
      where: { id },
      data: { priorityLevel: dto.priorityLevel as any },
      include: { order: true },
    });

    await this.prisma.order.update({
      where: { id: updated.orderId },
      data: { priorityOrder: true },
    });

    return updated;
  }

  async complete(hubId: string, id: string, updatedBy: string) {
    const emergency = await this.findHubEmergency(id, hubId);

    await this.prisma.$transaction([
      this.prisma.emergencyOrder.update({
        where: { id },
        data: { status: 'COMPLETED' },
      }),
      this.prisma.order.update({
        where: { id: emergency.orderId },
        data: { orderStatus: 'DELIVERED', deliveredAt: new Date() },
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: emergency.orderId,
          status: 'DELIVERED',
          updatedBy,
          remarks: 'Emergency order completed',
        },
      }),
    ]);

    return this.findHubEmergency(id, hubId);
  }

  private async findHubEmergency(id: string, hubId: string) {
    const emergency = await this.prisma.emergencyOrder.findFirst({
      where: { id, order: { hubId, deletedAt: null } },
      include: {
        order: {
          include: {
            customer: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
    });
    if (!emergency) throw new NotFoundException('Emergency order not found for this hub');
    return emergency;
  }
}
