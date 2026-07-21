import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { HubNotificationsQueryDto } from '../dto/hub.dto';

@Injectable()
export class HubNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(hubId: string, query: HubNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId, deletedAt: null };
    if (query.unreadOnly) where['isRead'] = false;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.hubNotification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.hubNotification.count({ where }),
      this.prisma.hubNotification.count({
        where: { hubId, isRead: false, deletedAt: null },
      }),
    ]);

    return {
      data,
      unreadCount,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markRead(hubId: string, id: string) {
    const notification = await this.prisma.hubNotification.findFirst({
      where: { id, hubId, deletedAt: null },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.hubNotification.update({
      where: { id },
      data: { isRead: true },
    });
  }
}
