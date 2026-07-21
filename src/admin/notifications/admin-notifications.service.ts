import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateNotificationDto, BroadcastNotificationDto, UpdateNotificationDto, NotificationQueryDto } from './dto/admin-notifications.dto';

@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.customerId) where['customerId'] = query.customerId;
    if (query.type) where['type'] = query.type;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { id: true, phone: true, fullName: true } } },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, deletedAt: null } });
    if (!n) throw new NotFoundException('Notification not found');
    return n;
  }

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        title: dto.title,
        body: dto.body,
        type: (dto.type as any),
        label: dto.label,
        customerId: dto.customerId,
        isGlobal: dto.isGlobal ?? false,
        actionLabel: dto.actionLabel,
        actionRoute: dto.actionRoute,
      },
    });
  }

  async broadcast(dto: BroadcastNotificationDto) {
    // Create a global notification
    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        body: dto.body,
        type: (dto.type as any),
        label: dto.label,
        isGlobal: true,
        actionLabel: dto.actionLabel,
        actionRoute: dto.actionRoute,
      },
    });

    // Also create individual notifications for all active customers
    const customers = await this.prisma.customer.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    if (customers.length > 0) {
      await this.prisma.notification.createMany({
        data: customers.map((c) => ({
          title: dto.title,
          body: dto.body,
          type: dto.type as any,
          label: dto.label,
          customerId: c.id,
          isGlobal: false,
          actionLabel: dto.actionLabel,
          actionRoute: dto.actionRoute,
        })),
      });
    }

    return { notification, sentTo: customers.length };
  }

  async update(id: string, dto: UpdateNotificationDto) {
    await this.findOne(id);
    return this.prisma.notification.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.notification.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
