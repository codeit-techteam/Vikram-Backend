import { Injectable, Logger } from '@nestjs/common';
import {
  LoyaltyTransactionType,
  NotificationType,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { CACHE_KEYS } from '../../../common/cache/cache.constants';
import { NotificationService } from '../../notification/notification.service';
import type { JobRunResult } from './scheduler-log.service';

@Injectable()
export class LoyaltyExpiryService {
  private readonly logger = new Logger(LoyaltyExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async expireLoyaltyPoints(): Promise<JobRunResult> {
    const now = new Date();
    const earnLots = await this.prisma.loyaltyTransaction.findMany({
      where: {
        type: LoyaltyTransactionType.EARN,
        expiresAt: { lte: now },
        remainingPoints: { gt: 0 },
      },
      include: {
        account: {
          select: {
            id: true,
            customerId: true,
            currentPoints: true,
            availablePoints: true,
          },
        },
      },
      take: 500,
    });

    let successCount = 0;
    let failedCount = 0;
    const notifiedCustomers = new Set<string>();

    for (const lot of earnLots) {
      try {
        const pointsToExpire = lot.remainingPoints ?? lot.points;
        if (pointsToExpire <= 0) continue;

        await this.prisma.$transaction(async (tx) => {
          await tx.loyaltyTransaction.update({
            where: { id: lot.id },
            data: { remainingPoints: 0 },
          });

          const account = await tx.loyaltyAccount.findUnique({
            where: { id: lot.accountId },
          });
          if (!account) return;

          const nextCurrent = Math.max(
            0,
            account.currentPoints - pointsToExpire,
          );
          const nextAvailable = Math.max(
            0,
            account.availablePoints - pointsToExpire,
          );

          await tx.loyaltyTransaction.create({
            data: {
              accountId: lot.accountId,
              points: pointsToExpire,
              type: LoyaltyTransactionType.EXPIRE,
              reason: 'Loyalty points expired',
              referenceId: lot.id,
              openingPoints: account.availablePoints,
              closingPoints: nextAvailable,
            },
          });

          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: {
              currentPoints: nextCurrent,
              availablePoints: nextAvailable,
            },
          });
        });

        if (!notifiedCustomers.has(lot.account.customerId)) {
          await this.notificationService.createForCustomer({
            customerId: lot.account.customerId,
            type: NotificationType.LOYALTY,
            label: 'Loyalty',
            title: 'Points Expired',
            body: 'Your loyalty points have expired.',
            actionRoute: '/loyalty',
            priority: 1,
          });
          notifiedCustomers.add(lot.account.customerId);
        }

        await this.cache.del(CACHE_KEYS.LOYALTY(lot.account.customerId));
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to expire loyalty lot ${lot.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      processedCount: earnLots.length,
      successCount,
      failedCount,
      metadata: {
        batchSize: earnLots.length,
        customersNotified: notifiedCustomers.size,
      },
    };
  }
}
