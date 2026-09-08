import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DevicePlatform,
  Prisma,
  PushCampaignAudienceType,
  PushCampaignDeliveryMode,
  PushCampaignStatus,
  PushDeepLinkTarget,
  PushUserSegment,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AudienceResolverService } from '../../modules/push/audience-resolver.service';
import { DeviceTokenService } from '../../modules/push/device-token.service';
import { FcmPushService } from '../../modules/push/fcm-push.service';
import { PushCampaignDispatchService } from '../../modules/push/push-campaign-dispatch.service';
import {
  actionLabelFor,
  buildActionRoute,
  requiresEntityId,
  resolveNotificationType,
  stringifyDataPayload,
} from '../../modules/push/push-deep-link';
import { ROLE_SEGMENT_SLUGS } from '../../modules/push/push.constants';
import type {
  CreatePushCampaignDto,
  PushCampaignQueryDto,
  SendTestPushDto,
  UpdatePushCampaignDto,
} from './dto/admin-push-campaigns.dto';

const IMAGE_URL_RE = /^https?:\/\/.+/i;

@Injectable()
export class AdminPushCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceResolver: AudienceResolverService,
    private readonly dispatch: PushCampaignDispatchService,
    private readonly fcm: FcmPushService,
    private readonly deviceTokens: DeviceTokenService,
  ) {}

  async create(adminId: string, dto: CreatePushCampaignDto) {
    this.validateImage(dto.imageUrl);
    this.validateDeepLink(dto.deepLinkTarget, dto.deepLinkValue);
    this.validateSchedule(dto.deliveryMode, dto.scheduledAt, dto.saveAsDraft);

    const audienceType = dto.audienceType as PushCampaignAudienceType;
    const audienceRows = this.buildAudienceRows(audienceType, dto);

    if (!dto.saveAsDraft) {
      this.assertFcmReady();
      await this.audienceResolver.resolveCustomerIds(audienceType, {
        hubIds: dto.hubIds,
        cities: dto.cities,
        segments: dto.segments,
        customerIds: dto.customerIds,
      });
    }

    const deepLinkTarget = dto.deepLinkTarget as PushDeepLinkTarget;
    const deliveryMode = dto.deliveryMode as PushCampaignDeliveryMode;
    const status = this.initialStatus(dto);

    const campaign = await this.prisma.pushCampaign.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        imageUrl: dto.imageUrl?.trim() || null,
        audienceType,
        deepLinkTarget,
        deepLinkValue: dto.deepLinkValue?.trim() || null,
        notificationType: resolveNotificationType(deepLinkTarget),
        status,
        deliveryMode,
        scheduledAt:
          deliveryMode === PushCampaignDeliveryMode.SCHEDULED && dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
        createdById: adminId,
        audiences: { create: audienceRows },
      },
      include: { audiences: true },
    });

    if (status === PushCampaignStatus.QUEUED) {
      this.dispatch.enqueue(campaign.id);
    }

    return this.mapCampaign(campaign);
  }

  async update(id: string, dto: UpdatePushCampaignDto) {
    const existing = await this.requireDraft(id);
    if (dto.imageUrl !== undefined) this.validateImage(dto.imageUrl ?? undefined);
    const deepLinkTarget = (dto.deepLinkTarget ??
      existing.deepLinkTarget) as PushDeepLinkTarget;
    const deepLinkValue =
      dto.deepLinkValue !== undefined
        ? dto.deepLinkValue
        : existing.deepLinkValue;
    this.validateDeepLink(deepLinkTarget, deepLinkValue ?? undefined);

    const audienceType = (dto.audienceType ??
      existing.audienceType) as PushCampaignAudienceType;
    const replaceAudience =
      dto.audienceType !== undefined ||
      dto.hubIds !== undefined ||
      dto.cities !== undefined ||
      dto.segments !== undefined ||
      dto.customerIds !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (replaceAudience) {
        await tx.pushCampaignAudience.deleteMany({ where: { campaignId: id } });
        await tx.pushCampaignAudience.createMany({
          data: this.buildAudienceRows(audienceType, {
            hubIds: dto.hubIds,
            cities: dto.cities,
            segments: dto.segments,
            customerIds: dto.customerIds,
          }).map((row) => ({ ...row, campaignId: id })),
        });
      }

      return tx.pushCampaign.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          body: dto.body?.trim(),
          imageUrl:
            dto.imageUrl === undefined ? undefined : dto.imageUrl?.trim() || null,
          audienceType,
          deepLinkTarget,
          deepLinkValue: deepLinkValue?.trim() || null,
          notificationType: resolveNotificationType(deepLinkTarget),
          deliveryMode: dto.deliveryMode as PushCampaignDeliveryMode | undefined,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        },
        include: { audiences: true },
      });
    });

    return this.mapCampaign(updated);
  }

  async sendDraft(id: string) {
    this.assertFcmReady();
    const campaign = await this.requireDraft(id);
    await this.audienceResolver.resolveCustomerIds(campaign.audienceType, {
      hubIds: campaign.audiences.map((a) => a.hubId).filter((v): v is string => !!v),
      cities: campaign.audiences.map((a) => a.city).filter((v): v is string => !!v),
      segments: campaign.audiences
        .map((a) => a.segment)
        .filter((v): v is PushUserSegment => !!v),
      customerIds: campaign.audiences
        .map((a) => a.userId)
        .filter((v): v is string => !!v),
    });

    const updated = await this.prisma.pushCampaign.update({
      where: { id },
      data: { status: PushCampaignStatus.QUEUED },
      include: { audiences: true },
    });
    this.dispatch.enqueue(id);
    return this.mapCampaign(updated);
  }

  async cancel(id: string) {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Notification not found');
    if (
      campaign.status !== PushCampaignStatus.SCHEDULED &&
      campaign.status !== PushCampaignStatus.DRAFT &&
      campaign.status !== PushCampaignStatus.QUEUED
    ) {
      throw new BadRequestException('Only draft, queued, or scheduled notifications can be cancelled');
    }
    const updated = await this.prisma.pushCampaign.update({
      where: { id },
      data: { status: PushCampaignStatus.CANCELLED },
      include: { audiences: true },
    });
    return this.mapCampaign(updated);
  }

  async findAll(query: PushCampaignQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PushCampaignWhereInput = {};
    if (query.status) {
      where.status = query.status.toUpperCase() as PushCampaignStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.pushCampaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { audiences: true },
      }),
      this.prisma.pushCampaign.count({ where }),
    ]);

    return {
      data: data.map((row) => this.mapCampaign(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.pushCampaign.findUnique({
      where: { id },
      include: { audiences: true },
    });
    if (!campaign) throw new NotFoundException('Notification not found');
    return this.mapCampaign(campaign);
  }

  async stats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [sentAgg, scheduledCount, activeSubscribers, openAgg] =
      await Promise.all([
        this.prisma.pushCampaign.aggregate({
          where: {
            status: {
              in: [
                PushCampaignStatus.SENT,
                PushCampaignStatus.PARTIALLY_SENT,
              ],
            },
            sentAt: { gte: monthStart },
          },
          _sum: { totalSent: true },
        }),
        this.prisma.pushCampaign.count({
          where: { status: PushCampaignStatus.SCHEDULED },
        }),
        this.deviceTokens.countActiveSubscribers(),
        this.prisma.pushCampaign.aggregate({
          where: {
            status: {
              in: [
                PushCampaignStatus.SENT,
                PushCampaignStatus.PARTIALLY_SENT,
              ],
            },
            sentAt: { gte: monthStart },
          },
          _sum: { totalOpened: true, totalDelivered: true },
        }),
      ]);

    const delivered = openAgg._sum.totalDelivered ?? 0;
    const opened = openAgg._sum.totalOpened ?? 0;
    const avgOpenRatePercent =
      delivered > 0 ? Math.round((opened / delivered) * 100) : 0;

    return {
      totalSentThisMonth: sentAgg._sum.totalSent ?? 0,
      avgOpenRatePercent,
      activeSubscribers,
      scheduledCount,
    };
  }

  async composerOptions() {
    const [hubs, roles, products, categories, offers] = await Promise.all([
      this.prisma.hub.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, city: true, code: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { displayOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { displayOrder: 'asc' },
        take: 100,
      }),
      this.prisma.offer.findMany({
        where: { deletedAt: null, isVisible: true },
        select: { id: true, title: true, slug: true },
        orderBy: { displayOrder: 'asc' },
        take: 100,
      }),
    ]);

    const cities = [...new Set(hubs.map((h) => h.city).filter(Boolean))].sort();

    return {
      fcmConfigured: this.fcm.isEnabled(),
      hubs: hubs.map((h) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        code: h.code,
        label: `${h.name} (${h.city})`,
      })),
      cities: cities.map((city) => ({ id: `city:${city}`, label: city })),
      segments: [
        { id: 'NEW_CUSTOMERS', label: 'New Users' },
        { id: 'EXISTING_CUSTOMERS', label: 'Existing Customers' },
        { id: 'ACTIVE', label: 'Active Users' },
        { id: 'DORMANT', label: 'Dormant Users' },
        { id: 'MEMBERS', label: 'Members' },
        ...roles.map((role) => {
          const segmentId =
            Object.entries(ROLE_SEGMENT_SLUGS).find(
              ([, slug]) => slug === role.slug,
            )?.[0] ?? role.slug.replace(/-/g, '_').toUpperCase();
          return {
            id: segmentId,
            label: role.name,
          };
        }),
      ],
      products: products.map((p) => ({ id: p.id, label: p.name, slug: p.slug })),
      categories: categories.map((c) => ({
        id: c.id,
        label: c.name,
        slug: c.slug,
      })),
      offers: offers.map((o) => ({ id: o.id, label: o.title, slug: o.slug })),
    };
  }

  async searchCustomers(search: string) {
    const q = search.trim();
    if (q.length < 2) return [];
    const rows = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        assignedHub: { select: { name: true, city: true } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      label:
        row.fullName ||
        row.phone ||
        row.email ||
        'Customer',
      phone: row.phone,
      email: row.email,
      hub: row.assignedHub?.name ?? null,
      city: row.assignedHub?.city ?? null,
    }));
  }

  async registerAdminDevice(
    adminId: string,
    input: { token: string; platform?: string; deviceId?: string },
  ) {
    const platform = this.parsePlatform(input.platform);
    const token = input.token.trim();
    const existing = await this.prisma.adminDeviceToken.findUnique({
      where: { token },
    });
    if (existing) {
      return this.prisma.adminDeviceToken.update({
        where: { token },
        data: {
          adminUserId: adminId,
          platform,
          deviceId: input.deviceId ?? existing.deviceId,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });
    }
    return this.prisma.adminDeviceToken.create({
      data: {
        adminUserId: adminId,
        token,
        platform,
        deviceId: input.deviceId,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  async sendTest(admin: { id: string; email: string; phone?: string | null }, dto: SendTestPushDto) {
    this.assertFcmReady();
    this.validateImage(dto.imageUrl);
    const tokens = await this.resolveAdminTestTokens(admin);
    if (tokens.length === 0) {
      throw new BadRequestException(
        'No registered device found for test notification.',
      );
    }

    const deepLinkTarget = (dto.deepLinkTarget ?? 'HOME') as PushDeepLinkTarget;
    const result = await this.fcm.sendToTokens(tokens, {
      title: dto.title.trim(),
      body: dto.body.trim(),
      imageUrl: dto.imageUrl,
      data: stringifyDataPayload({
        notificationId: 'test',
        notificationType: 'ADMIN_ANNOUNCEMENT',
        deepLink: deepLinkTarget.toLowerCase(),
        entityId: dto.deepLinkValue ?? '',
        imageUrl: dto.imageUrl ?? '',
        timestamp: new Date().toISOString(),
      }),
    });

    const matchingCustomer = await this.findCustomerForAdmin(admin);
    if (matchingCustomer) {
      await this.prisma.notification.create({
        data: {
          customerId: matchingCustomer.id,
          type: resolveNotificationType(deepLinkTarget),
          label: 'TEST',
          title: dto.title.trim(),
          body: dto.body.trim(),
          imageUrl: dto.imageUrl?.trim() || null,
          actionLabel: actionLabelFor(deepLinkTarget),
          actionRoute: buildActionRoute({
            target: deepLinkTarget,
            value: dto.deepLinkValue,
          }),
          isGlobal: false,
        },
      });
    }

    return {
      sent: result.successCount,
      failed: result.failureCount,
      fcmConfigured: this.fcm.isEnabled(),
    };
  }

  private async resolveAdminTestTokens(admin: {
    id: string;
    email: string;
    phone?: string | null;
  }): Promise<string[]> {
    const adminTokens = await this.prisma.adminDeviceToken.findMany({
      where: { adminUserId: admin.id, isActive: true },
      select: { token: true },
    });
    const tokens = new Set(adminTokens.map((t) => t.token));

    const customer = await this.findCustomerForAdmin(admin);
    if (customer) {
      const customerTokens = await this.prisma.notificationToken.findMany({
        where: { customerId: customer.id, isActive: true },
        select: { token: true },
      });
      for (const row of customerTokens) tokens.add(row.token);
    }

    return [...tokens];
  }

  private async findCustomerForAdmin(admin: {
    email: string;
    phone?: string | null;
  }) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (admin.email) {
      or.push({ email: { equals: admin.email, mode: 'insensitive' } });
    }
    if (admin.phone) {
      or.push({ phone: admin.phone });
    }
    if (or.length === 0) return null;
    return this.prisma.customer.findFirst({
      where: { deletedAt: null, OR: or },
      select: { id: true },
    });
  }

  private initialStatus(dto: CreatePushCampaignDto): PushCampaignStatus {
    if (dto.saveAsDraft) return PushCampaignStatus.DRAFT;
    if (dto.deliveryMode === 'SCHEDULED') return PushCampaignStatus.SCHEDULED;
    return PushCampaignStatus.QUEUED;
  }

  private assertFcmReady() {
    if (this.fcm.isEnabled()) return;
    throw new BadRequestException(
      'Push delivery is not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY on the DigitalOcean vikram-backend app, then redeploy.',
    );
  }

  private validateSchedule(
    mode: string,
    scheduledAt?: string,
    saveAsDraft?: boolean,
  ) {
    if (saveAsDraft) return;
    if (mode !== 'SCHEDULED') return;
    if (!scheduledAt) {
      throw new BadRequestException('scheduledAt is required for scheduled delivery');
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }
  }

  private validateImage(imageUrl?: string) {
    if (!imageUrl) return;
    const value = imageUrl.trim();
    if (!IMAGE_URL_RE.test(value) || value.startsWith('data:')) {
      throw new BadRequestException(
        'Notification image must be an uploaded HTTP(S) URL',
      );
    }
  }

  private validateDeepLink(target: string, value?: string) {
    const t = target as PushDeepLinkTarget;
    if (requiresEntityId(t) && !value?.trim()) {
      throw new BadRequestException(`deepLinkValue is required for ${target}`);
    }
    if (t === PushDeepLinkTarget.CUSTOM && !value?.trim()) {
      throw new BadRequestException('Custom URL is required');
    }
  }

  private buildAudienceRows(
    audienceType: PushCampaignAudienceType,
    dto: {
      hubIds?: string[];
      cities?: string[];
      segments?: string[];
      customerIds?: string[];
    },
  ) {
    if (audienceType === PushCampaignAudienceType.ALL) {
      return [{ audienceType }];
    }
    if (audienceType === PushCampaignAudienceType.CITY_HUB) {
      const rows = [
        ...(dto.hubIds ?? []).map((hubId) => ({
          audienceType,
          hubId,
        })),
        ...(dto.cities ?? []).map((city) => ({
          audienceType,
          city: city.replace(/^city:/i, ''),
        })),
      ];
      if (rows.length === 0) {
        throw new BadRequestException('Select at least one city or hub');
      }
      return rows;
    }
    if (audienceType === PushCampaignAudienceType.SEGMENT) {
      const rows = (dto.segments ?? []).map((segment) => ({
        audienceType,
        segment: segment.toUpperCase().replace(/-/g, '_') as PushUserSegment,
      }));
      if (rows.length === 0) {
        throw new BadRequestException('Select at least one segment');
      }
      return rows;
    }
    const rows = (dto.customerIds ?? []).map((userId) => ({
      audienceType,
      userId,
    }));
    if (rows.length === 0) {
      throw new BadRequestException('Select at least one customer');
    }
    return rows;
  }

  private async requireDraft(id: string) {
    const campaign = await this.prisma.pushCampaign.findUnique({
      where: { id },
      include: { audiences: true },
    });
    if (!campaign) throw new NotFoundException('Notification not found');
    if (campaign.status !== PushCampaignStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be edited');
    }
    return campaign;
  }

  private parsePlatform(value?: string): DevicePlatform {
    const normalized = String(value ?? 'ANDROID').toUpperCase();
    if (normalized === 'IOS') return DevicePlatform.IOS;
    if (normalized === 'WEB') return DevicePlatform.WEB;
    return DevicePlatform.ANDROID;
  }

  mapCampaign(campaign: {
    id: string;
    title: string;
    body: string;
    imageUrl: string | null;
    audienceType: PushCampaignAudienceType;
    deepLinkTarget: PushDeepLinkTarget;
    deepLinkValue: string | null;
    status: PushCampaignStatus;
    deliveryMode: PushCampaignDeliveryMode;
    scheduledAt: Date | null;
    sentAt: Date | null;
    createdAt: Date;
    totalRecipients: number;
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalFailed: number;
    audiences: Array<{
      city: string | null;
      hubId: string | null;
      segment: PushUserSegment | null;
      userId: string | null;
    }>;
  }) {
    const delivered = campaign.totalDelivered;
    const openRatePercent =
      delivered > 0
        ? Math.round((campaign.totalOpened / delivered) * 100)
        : 0;

    return {
      id: campaign.id,
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl,
      audienceType: campaign.audienceType,
      audienceLabel: this.audienceLabel(campaign),
      deepLinkTarget: campaign.deepLinkTarget,
      deepLinkValue: campaign.deepLinkValue,
      status: campaign.status,
      deliveryMode: campaign.deliveryMode,
      scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      totalRecipients: campaign.totalRecipients,
      totalSent: campaign.totalSent,
      totalDelivered: campaign.totalDelivered,
      totalOpened: campaign.totalOpened,
      totalFailed: campaign.totalFailed,
      openRatePercent,
      queued: campaign.status === PushCampaignStatus.QUEUED,
    };
  }

  private audienceLabel(campaign: {
    audienceType: PushCampaignAudienceType;
    audiences: Array<{
      city: string | null;
      hubId: string | null;
      segment: PushUserSegment | null;
      userId: string | null;
    }>;
    totalRecipients: number;
  }): string {
    switch (campaign.audienceType) {
      case PushCampaignAudienceType.ALL:
        return campaign.totalRecipients > 0
          ? `All Users · ${campaign.totalRecipients}`
          : 'All Users';
      case PushCampaignAudienceType.CITY_HUB: {
        const parts = campaign.audiences
          .map((a) => a.city)
          .filter((v): v is string => !!v);
        return parts.length > 0
          ? `City / Hub · ${parts.join(', ')}`
          : 'City / Hub';
      }
      case PushCampaignAudienceType.SEGMENT: {
        const parts = campaign.audiences
          .map((a) => a.segment)
          .filter((v): v is PushUserSegment => !!v);
        return parts.length > 0
          ? `Segment · ${parts.join(', ')}`
          : 'User Segment';
      }
      case PushCampaignAudienceType.CUSTOM_LIST: {
        const count = campaign.audiences.filter((a) => a.userId).length;
        return count === 1 ? 'Particular User' : `Custom List · ${count}`;
      }
      default:
        return campaign.audienceType;
    }
  }
}
