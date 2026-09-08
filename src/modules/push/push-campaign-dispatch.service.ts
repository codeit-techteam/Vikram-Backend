import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationType,
  PushCampaignAudienceType,
  PushCampaignStatus,
  PushDeliveryStatus,
  PushUserSegment,
} from '../../../generated/prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AudienceResolverService } from './audience-resolver.service';
import { INBOX_INSERT_BATCH, TOKEN_QUERY_PAGE } from './push.constants';
import {
  actionLabelFor,
  buildActionRoute,
  stringifyDataPayload,
} from './push-deep-link';
import { FcmPushService } from './fcm-push.service';
import { PushInboxEventsService } from './push-inbox.events';

@Injectable()
export class PushCampaignDispatchService {
  private readonly logger = new Logger(PushCampaignDispatchService.name);
  private readonly queue: string[] = [];
  private running = false;
  private readonly queued = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmPushService,
    private readonly cache: CacheService,
    private readonly audienceResolver: AudienceResolverService,
    private readonly inboxEvents: PushInboxEventsService,
  ) {}

  enqueue(campaignId: string): void {
    if (this.queued.has(campaignId)) return;
    this.queued.add(campaignId);
    this.queue.push(campaignId);
    void this.drain();
  }

  async processDueScheduled(): Promise<number> {
    const due = await this.prisma.pushCampaign.findMany({
      where: {
        status: PushCampaignStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
      take: 10,
      orderBy: { scheduledAt: 'asc' },
    });
    for (const campaign of due) {
      this.enqueue(campaign.id);
    }
    return due.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const campaignId = this.queue.shift();
        if (!campaignId) continue;
        this.queued.delete(campaignId);
        try {
          await this.processCampaign(campaignId);
        } catch (error) {
          this.logger.error(
            `Campaign ${campaignId} failed: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
          await this.prisma.pushCampaign
            .updateMany({
              where: {
                id: campaignId,
                status: {
                  in: [
                    PushCampaignStatus.QUEUED,
                    PushCampaignStatus.SENDING,
                    PushCampaignStatus.SCHEDULED,
                  ],
                },
              },
              data: { status: PushCampaignStatus.FAILED },
            })
            .catch(() => undefined);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async processCampaign(campaignId: string): Promise<void> {
    const claimed = await this.prisma.pushCampaign.updateMany({
      where: {
        id: campaignId,
        status: {
          in: [
            PushCampaignStatus.QUEUED,
            PushCampaignStatus.SCHEDULED,
            PushCampaignStatus.SENDING,
          ],
        },
      },
      data: { status: PushCampaignStatus.SENDING },
    });

    if (claimed.count === 0) {
      this.logger.debug(`Skip campaign ${campaignId} — not claimable`);
      return;
    }

    const campaign = await this.prisma.pushCampaign.findUnique({
      where: { id: campaignId },
      include: { audiences: true },
    });
    if (!campaign) return;

    const customerIds = await this.resolveRecipients(campaign);
    const uniqueCustomerIds = [...new Set(customerIds)];

    await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: { totalRecipients: uniqueCustomerIds.length },
    });

    await this.createInboxRows(campaign, uniqueCustomerIds);

    const deliveryStats = await this.sendToDevices(campaign, uniqueCustomerIds);

    const status = this.finalStatus(
      uniqueCustomerIds.length,
      deliveryStats.sent,
      deliveryStats.failed,
    );

    await this.prisma.pushCampaign.update({
      where: { id: campaignId },
      data: {
        status,
        sentAt: new Date(),
        totalSent: deliveryStats.sent,
        totalFailed: deliveryStats.failed,
        totalDelivered: deliveryStats.sent,
      },
    });

    this.logger.log(
      `Campaign ${campaignId} ${status} recipients=${uniqueCustomerIds.length} sent=${deliveryStats.sent} failed=${deliveryStats.failed}`,
    );
  }

  private async resolveRecipients(campaign: {
    audienceType: PushCampaignAudienceType;
    audiences: Array<{
      userId: string | null;
      hubId: string | null;
      city: string | null;
      segment: PushUserSegment | null;
    }>;
  }): Promise<string[]> {
    return this.audienceResolver.resolveCustomerIds(campaign.audienceType, {
      hubIds: campaign.audiences
        .map((row) => row.hubId)
        .filter((id): id is string => !!id),
      cities: campaign.audiences
        .map((row) => row.city)
        .filter((city): city is string => !!city),
      segments: campaign.audiences
        .map((row) => row.segment)
        .filter((segment): segment is PushUserSegment => !!segment),
      customerIds: campaign.audiences
        .map((row) => row.userId)
        .filter((id): id is string => !!id),
    });
  }

  private async createInboxRows(
    campaign: {
      id: string;
      title: string;
      body: string;
      imageUrl: string | null;
      notificationType: NotificationType;
      deepLinkTarget: Parameters<typeof buildActionRoute>[0]['target'];
      deepLinkValue: string | null;
    },
    customerIds: string[],
  ): Promise<void> {
    const actionRoute = buildActionRoute({
      target: campaign.deepLinkTarget,
      value: campaign.deepLinkValue,
    });
    const actionLabel = actionLabelFor(campaign.deepLinkTarget);

    for (let i = 0; i < customerIds.length; i += INBOX_INSERT_BATCH) {
      const slice = customerIds.slice(i, i + INBOX_INSERT_BATCH);
      await this.prisma.notification.createMany({
        data: slice.map((customerId) => ({
          customerId,
          campaignId: campaign.id,
          type: campaign.notificationType,
          label: campaign.notificationType.replace(/_/g, ' '),
          title: campaign.title,
          body: campaign.body,
          imageUrl: campaign.imageUrl,
          actionLabel,
          actionRoute,
          actionVariant: 'outline',
          isGlobal: false,
          isRead: false,
        })),
        skipDuplicates: true,
      });
    }

    await this.cache.invalidateNotifications().catch(() => undefined);
    this.inboxEvents.emitInboxCreated({
      campaignId: campaign.id,
      customerIds,
    });
  }

  private async sendToDevices(
    campaign: {
      id: string;
      title: string;
      body: string;
      imageUrl: string | null;
      notificationType: NotificationType;
      deepLinkTarget: Parameters<typeof buildActionRoute>[0]['target'];
      deepLinkValue: string | null;
    },
    customerIds: string[],
  ): Promise<{ sent: number; failed: number }> {
    if (customerIds.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const tokens: Array<{
      id: string;
      customerId: string;
      token: string;
      platform: 'IOS' | 'ANDROID' | 'WEB';
    }> = [];

    for (let i = 0; i < customerIds.length; i += TOKEN_QUERY_PAGE) {
      const slice = customerIds.slice(i, i + TOKEN_QUERY_PAGE);
      const page = await this.prisma.notificationToken.findMany({
        where: { customerId: { in: slice }, isActive: true },
        select: { id: true, customerId: true, token: true, platform: true },
      });
      tokens.push(...page);
    }

    const uniqueTokens = new Map<string, (typeof tokens)[number]>();
    for (const row of tokens) {
      if (!uniqueTokens.has(row.token)) uniqueTokens.set(row.token, row);
    }
    const deviceRows = [...uniqueTokens.values()];

    const now = new Date();
    for (let i = 0; i < deviceRows.length; i += INBOX_INSERT_BATCH) {
      const slice = deviceRows.slice(i, i + INBOX_INSERT_BATCH);
      await this.prisma.pushCampaignDelivery.createMany({
        data: slice.map((row) => ({
          campaignId: campaign.id,
          customerId: row.customerId,
          tokenId: row.id,
          deviceToken: row.token,
          platform: row.platform,
          status: PushDeliveryStatus.PENDING,
        })),
        skipDuplicates: true,
      });
    }

    const pending = await this.prisma.pushCampaignDelivery.findMany({
      where: {
        campaignId: campaign.id,
        status: PushDeliveryStatus.PENDING,
      },
      select: { deviceToken: true, customerId: true, tokenId: true },
    });

    if (pending.length === 0) {
      this.logger.log(
        `Campaign ${campaign.id}: inbox created for ${customerIds.length} customers, no pending device deliveries`,
      );
      return { sent: 0, failed: 0 };
    }

    const data = stringifyDataPayload({
      notificationId: campaign.id,
      notificationType: campaign.notificationType,
      deepLink: campaign.deepLinkTarget.toLowerCase(),
      entityId: campaign.deepLinkValue ?? '',
      imageUrl: campaign.imageUrl ?? '',
      timestamp: now.toISOString(),
    });

    const fcm = await this.fcm.sendToTokens(
      pending.map((row) => row.deviceToken),
      {
        title: campaign.title,
        body: campaign.body,
        imageUrl: campaign.imageUrl,
        data,
      },
    );

    const byToken = new Map(fcm.results.map((r) => [r.token, r]));
    const sentAt = new Date();

    await Promise.all(
      pending.map(async (row) => {
        const result = byToken.get(row.deviceToken);
        const success = result?.success === true;
        await this.prisma.pushCampaignDelivery.updateMany({
          where: {
            campaignId: campaign.id,
            deviceToken: row.deviceToken,
          },
          data: {
            status: success ? PushDeliveryStatus.SENT : PushDeliveryStatus.FAILED,
            providerMessageId: result?.messageId,
            errorCode: result?.errorCode,
            sentAt,
            deliveredAt: success ? sentAt : null,
            attemptCount: { increment: 1 },
          },
        });
      }),
    );

    return { sent: fcm.successCount, failed: fcm.failureCount };
  }

  private finalStatus(
    recipients: number,
    sent: number,
    failed: number,
  ): PushCampaignStatus {
    if (recipients === 0) return PushCampaignStatus.SENT;
    if (sent === 0 && failed > 0) return PushCampaignStatus.FAILED;
    if (failed > 0 && sent > 0) return PushCampaignStatus.PARTIALLY_SENT;
    return PushCampaignStatus.SENT;
  }
}
