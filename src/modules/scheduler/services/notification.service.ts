import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationType,
  ScheduledNotificationChannel,
  ScheduledNotificationStatus,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import type { JobRunResult } from './scheduler-log.service';

@Injectable()
export class ScheduledNotificationDispatchService {
  private readonly logger = new Logger(
    ScheduledNotificationDispatchService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async dispatchDueNotifications(): Promise<JobRunResult> {
    const now = new Date();
    const due = await this.prisma.scheduledNotification.findMany({
      where: {
        status: ScheduledNotificationStatus.PENDING,
        scheduledTime: { lte: now },
      },
      orderBy: { scheduledTime: 'asc' },
      take: 200,
    });

    let successCount = 0;
    let failedCount = 0;

    for (const item of due) {
      try {
        await this.dispatchOne(item);
        await this.prisma.scheduledNotification.update({
          where: { id: item.id },
          data: {
            status: ScheduledNotificationStatus.SENT,
            sentAt: new Date(),
            attempts: { increment: 1 },
            failureReason: null,
          },
        });
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        const message =
          error instanceof Error ? error.message : 'Unknown dispatch error';
        this.logger.error(
          `Failed to dispatch scheduled notification ${item.id}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );

        await this.prisma.scheduledNotification.update({
          where: { id: item.id },
          data: {
            status: ScheduledNotificationStatus.FAILED,
            attempts: { increment: 1 },
            failureReason: message.slice(0, 500),
          },
        });
      }
    }

    return {
      processedCount: due.length,
      successCount,
      failedCount,
      metadata: { batchSize: due.length },
    };
  }

  private async dispatchOne(item: {
    id: string;
    customerId: string | null;
    channel: ScheduledNotificationChannel;
    type: NotificationType;
    title: string;
    body: string;
  }): Promise<void> {
    switch (item.channel) {
      case ScheduledNotificationChannel.IN_APP:
      case ScheduledNotificationChannel.PUSH:
        if (!item.customerId) {
          throw new Error(
            'customerId is required for IN_APP/PUSH notifications',
          );
        }
        await this.notificationService.createForCustomer({
          customerId: item.customerId,
          type: item.type,
          label: item.channel,
          title: item.title,
          body: item.body,
          priority: 1,
        });
        // PUSH provider (FCM) can be wired here later using notification tokens.
        break;

      case ScheduledNotificationChannel.SMS:
      case ScheduledNotificationChannel.WHATSAPP:
      case ScheduledNotificationChannel.EMAIL:
        // Future providers — mark as sent once provider integrations exist.
        this.logger.warn(
          `Channel ${item.channel} not yet integrated; marking ${item.id} as sent (no-op provider)`,
        );
        break;

      default:
        throw new Error(`Unsupported channel: ${item.channel as string}`);
    }
  }
}
