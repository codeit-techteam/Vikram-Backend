import { Injectable, Logger } from '@nestjs/common';
import {
  MembershipStatus,
  NotificationType,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { CACHE_KEYS } from '../../../common/cache/cache.constants';
import { NotificationService } from '../../notification/notification.service';
import type { JobRunResult } from './scheduler-log.service';

@Injectable()
export class MembershipExpiryService {
  private readonly logger = new Logger(MembershipExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  async expireMemberships(): Promise<JobRunResult> {
    const now = new Date();
    const expired = await this.prisma.customerMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        expiryDate: { lte: now },
      },
      select: {
        id: true,
        customerId: true,
      },
      take: 500,
    });

    let successCount = 0;
    let failedCount = 0;

    for (const membership of expired) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.customerMembership.update({
            where: { id: membership.id },
            data: { status: MembershipStatus.EXPIRED },
          });

          await tx.customer.update({
            where: { id: membership.customerId },
            data: {
              isMember: false,
              membershipId: null,
            },
          });

          await tx.auditLog.create({
            data: {
              action: 'UPDATE',
              resource: 'CustomerMembership',
              resourceId: membership.id,
              adminEmail: 'system:scheduler',
              oldValue: {
                status: MembershipStatus.ACTIVE,
                isMember: true,
              },
              newValue: {
                status: MembershipStatus.EXPIRED,
                isMember: false,
              },
            },
          });
        });

        await this.notificationService.createForCustomer({
          customerId: membership.customerId,
          type: NotificationType.MEMBERSHIP,
          label: 'Membership',
          title: 'Membership Expired',
          body: 'Your Bajriwala Membership has expired. Renew now to continue premium benefits.',
          actionLabel: 'Renew',
          actionRoute: '/membership',
          priority: 1,
        });

        await this.cache.del(CACHE_KEYS.MEMBERSHIP(membership.customerId));
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logger.error(
          `Failed to expire membership ${membership.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      processedCount: expired.length,
      successCount,
      failedCount,
      metadata: { batchSize: expired.length },
    };
  }
}
