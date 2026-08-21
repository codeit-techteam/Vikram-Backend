import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import { hashQueryParams } from '../../common/utils/prisma.util';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';

export interface CreateCustomerNotificationInput {
  customerId: string;
  type: NotificationType;
  label: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionRoute?: string;
  actionVariant?: string;
  priority?: number;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(
    customerId: string,
    query: NotificationQueryDto,
  ): Promise<{
    items: NotificationResponseDto[];
    meta: ReturnType<typeof buildPaginationMeta>;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const cacheKey =
      CACHE_KEYS.NOTIFICATIONS(customerId) +
      `:${hashQueryParams({ ...query, page, limit })}`;

    const cached = await this.cache.get<{
      items: NotificationResponseDto[];
      meta: ReturnType<typeof buildPaginationMeta>;
    }>(cacheKey);

    if (cached) return cached;

    const where = this.buildWhere(customerId, query);

    const [total, notifications] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const result = {
      items: notifications.map((n) => this.mapNotification(n)),
      meta: buildPaginationMeta(page, limit, total),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.NOTIFICATIONS);
    return result;
  }

  async getUnreadCount(customerId: string): Promise<UnreadCountResponseDto> {
    const cacheKey = CACHE_KEYS.NOTIFICATION_UNREAD(customerId);
    const cached = await this.cache.get<UnreadCountResponseDto>(cacheKey);
    if (cached) return cached;

    const count = await this.prisma.notification.count({
      where: {
        deletedAt: null,
        isRead: false,
        OR: [{ isGlobal: true }, { customerId }],
      },
    });

    const result = { count };
    await this.cache.set(cacheKey, result, CACHE_TTL.NOTIFICATION_UNREAD);
    return result;
  }

  async createForCustomer(
    input: CreateCustomerNotificationInput,
  ): Promise<NotificationResponseDto> {
    const created = await this.prisma.notification.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        label: input.label,
        title: input.title,
        body: input.body,
        actionLabel: input.actionLabel,
        actionRoute: input.actionRoute,
        actionVariant: input.actionVariant,
        isGlobal: false,
        priority: input.priority ?? 0,
      },
    });

    await this.invalidateCustomerCaches(input.customerId);
    return this.mapNotification(created);
  }

  async markAsRead(
    customerId: string,
    id: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.findOwnedOrGlobal(customerId, id);

    if (notification.isRead) {
      return this.mapNotification(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    await this.invalidateCustomerCaches(customerId);
    return this.mapNotification(updated);
  }

  async markAllAsRead(customerId: string): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        deletedAt: null,
        isRead: false,
        OR: [{ customerId }, { isGlobal: true }],
      },
      data: { isRead: true },
    });

    await this.invalidateCustomerCaches(customerId);
    return { updatedCount: result.count };
  }

  async remove(customerId: string, id: string): Promise<{ deleted: boolean }> {
    const notification = await this.findOwnedOrGlobal(customerId, id);

    if (notification.isGlobal || notification.customerId !== customerId) {
      throw new ForbiddenException(
        'Only your personal notifications can be deleted',
      );
    }

    await this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateCustomerCaches(customerId);
    return { deleted: true };
  }

  private async findOwnedOrGlobal(customerId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ customerId }, { isGlobal: true }],
      },
    });

    if (!notification) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }

    return notification;
  }

  private buildWhere(
    customerId: string,
    query: NotificationQueryDto,
  ): Prisma.NotificationWhereInput {
    return {
      deletedAt: null,
      AND: [
        {
          OR: [{ isGlobal: true }, { customerId }],
        },
        ...(query.type ? [{ type: query.type }] : []),
        ...(query.isRead !== undefined ? [{ isRead: query.isRead }] : []),
        ...(query.search
          ? [
              {
                OR: [
                  {
                    title: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    body: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    label: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
  }

  private mapNotification(n: {
    id: string;
    type: NotificationResponseDto['type'];
    label: string;
    title: string;
    body: string;
    actionLabel: string | null;
    actionRoute: string | null;
    actionVariant: string | null;
    isRead: boolean;
    createdAt: Date;
  }): NotificationResponseDto {
    return {
      id: n.id,
      type: n.type,
      label: n.label,
      title: n.title,
      body: n.body,
      actionLabel: n.actionLabel,
      actionRoute: n.actionRoute,
      actionVariant: n.actionVariant,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    };
  }

  private async invalidateCustomerCaches(customerId: string): Promise<void> {
    await this.cache.invalidateNotifications(customerId);
    await this.cache.invalidateUnreadCount(customerId);
  }
}
