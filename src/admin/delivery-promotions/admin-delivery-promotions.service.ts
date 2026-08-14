import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BannerTargetAudience,
  DeliveryPromotionExhaustedBehavior,
  DeliveryPromotionPlacement,
  EntityStatus,
  Visibility,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { R2StorageService } from '../../storage/r2.service';
import {
  parsePromotionEndAt,
  parsePromotionStartAt,
  resolveDeliveryPromotionLifecycle,
  slugifyPromotionName,
} from '../../modules/delivery-promotion/delivery-promotion.logic';
import type {
  CreateDeliveryPromotionDto,
  UpdateDeliveryPromotionDto,
} from './dto/admin-delivery-promotions.dto';

@Injectable()
export class AdminDeliveryPromotionsService {
  private readonly logger = new Logger(AdminDeliveryPromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  async findAll() {
    const rows = await this.prisma.deliveryPromotion.findMany({
      where: { deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.withLifecycle(row));
  }

  async findOne(id: string) {
    const row = await this.prisma.deliveryPromotion.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Delivery promotion not found');
    return this.withLifecycle(row);
  }

  async create(dto: CreateDeliveryPromotionDto, adminId?: string) {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    this.assertCta(dto.ctaEnabled, dto.ctaValue);
    const publish = dto.publish === true || this.isPublishedStatus(dto.status);
    if (publish) {
      this.assertBanner(dto.bannerImage, dto.mobileBannerImage);
    }
    const { status, isVisible, visibility } = this.resolvePublishState(
      dto.status,
      publish,
      dto.startsAt,
    );

    const row = await this.prisma.deliveryPromotion.create({
      data: {
        name: dto.name.trim(),
        slug: await this.uniqueSlug(dto.slug || slugifyPromotionName(dto.name)),
        description: dto.description,
        headline: dto.headline.trim(),
        subtitle: dto.subtitle,
        badge: dto.badge,
        remainingHeadline: dto.remainingHeadline,
        exhaustedHeadline: dto.exhaustedHeadline,
        exhaustedBehavior:
          dto.exhaustedBehavior ?? DeliveryPromotionExhaustedBehavior.HIDE,
        bannerImage: dto.mobileBannerImage || dto.bannerImage || '',
        mobileBannerImage: dto.mobileBannerImage,
        desktopBannerImage: dto.desktopBannerImage,
        placement:
          dto.placement ??
          DeliveryPromotionPlacement.HOME_TOP_DELIVERY_PROMOTION,
        targetAudience:
          dto.targetAudience ?? BannerTargetAudience.FREE_BIKE_REMAINING,
        priority: dto.priority ?? 10,
        ctaEnabled: dto.ctaEnabled === true,
        ctaLabel: dto.ctaLabel,
        ctaType: dto.ctaEnabled ? dto.ctaType || 'ROUTE' : 'NONE',
        ctaValue: dto.ctaEnabled ? dto.ctaValue : null,
        startsAt: dto.startsAt ? parsePromotionStartAt(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? parsePromotionEndAt(dto.endsAt) : undefined,
        status,
        isVisible,
        visibility,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    await this.cache.invalidateCms();
    return this.withLifecycle(row);
  }

  async update(id: string, dto: UpdateDeliveryPromotionDto, adminId?: string) {
    await this.findOne(id);
    this.assertSchedule(dto.startsAt, dto.endsAt);
    if (dto.ctaEnabled === true) this.assertCta(true, dto.ctaValue);

    const publishState =
      dto.publish !== undefined || dto.status !== undefined
        ? this.resolvePublishState(
            dto.status,
            dto.publish === true || this.isPublishedStatus(dto.status),
            dto.startsAt,
          )
        : null;

    const row = await this.prisma.deliveryPromotion.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.headline !== undefined && { headline: dto.headline.trim() }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.remainingHeadline !== undefined && {
          remainingHeadline: dto.remainingHeadline,
        }),
        ...(dto.exhaustedHeadline !== undefined && {
          exhaustedHeadline: dto.exhaustedHeadline,
        }),
        ...(dto.exhaustedBehavior !== undefined && {
          exhaustedBehavior: dto.exhaustedBehavior,
        }),
        ...(dto.bannerImage !== undefined && { bannerImage: dto.bannerImage }),
        ...(dto.mobileBannerImage !== undefined && {
          mobileBannerImage: dto.mobileBannerImage,
          bannerImage: dto.mobileBannerImage || dto.bannerImage,
        }),
        ...(dto.desktopBannerImage !== undefined && {
          desktopBannerImage: dto.desktopBannerImage,
        }),
        ...(dto.placement !== undefined && { placement: dto.placement }),
        ...(dto.targetAudience !== undefined && {
          targetAudience: dto.targetAudience,
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.ctaEnabled !== undefined && { ctaEnabled: dto.ctaEnabled }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.ctaType !== undefined && { ctaType: dto.ctaType }),
        ...(dto.ctaValue !== undefined && { ctaValue: dto.ctaValue }),
        ...(dto.ctaEnabled === false && { ctaType: 'NONE', ctaValue: null }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? parsePromotionStartAt(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? parsePromotionEndAt(dto.endsAt) : null,
        }),
        ...(publishState && publishState),
        updatedBy: adminId,
      },
    });
    await this.cache.invalidateCms();
    return this.withLifecycle(row);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    const row = await this.prisma.deliveryPromotion.update({
      where: { id },
      data: { deletedAt: new Date(), isVisible: false, status: EntityStatus.INACTIVE },
    });

    const urls = [
      existing.bannerImage,
      existing.mobileBannerImage,
      existing.desktopBannerImage,
    ];
    for (const url of urls) {
      const key = this.storage.extractStorageKey(url);
      if (!key) continue;
      try {
        await this.storage.deleteFile(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete R2 object for delivery promotion ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.cache.invalidateCms();
    return this.withLifecycle(row);
  }

  async publish(id: string, adminId?: string) {
    const existing = await this.findOne(id);
    this.assertBanner(existing.bannerImage, existing.mobileBannerImage);
    if (existing.ctaEnabled) this.assertCta(true, existing.ctaValue);

    const row = await this.prisma.deliveryPromotion.update({
      where: { id },
      data: {
        status: EntityStatus.ACTIVE,
        isVisible: true,
        visibility: this.resolveVisibility(true, existing.startsAt?.toISOString()),
        updatedBy: adminId,
      },
    });
    await this.cache.invalidateCms();
    return this.withLifecycle(row);
  }

  async unpublish(id: string, adminId?: string) {
    await this.findOne(id);
    const row = await this.prisma.deliveryPromotion.update({
      where: { id },
      data: {
        status: EntityStatus.INACTIVE,
        isVisible: false,
        visibility: Visibility.HIDDEN,
        updatedBy: adminId,
      },
    });
    await this.cache.invalidateCms();
    return this.withLifecycle(row);
  }

  private withLifecycle<T extends {
    status: string;
    isVisible: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }>(row: T) {
    return {
      ...row,
      lifecycleStatus: resolveDeliveryPromotionLifecycle(row),
    };
  }

  private isPublishedStatus(status?: string) {
    const value = (status || '').toUpperCase();
    return value === 'ACTIVE' || value === 'SCHEDULED';
  }

  private resolvePublishState(
    status: string | undefined,
    publish: boolean,
    startsAt?: string,
  ) {
    const requested = (status || '').toUpperCase();
    if (requested === 'DRAFT' || (!publish && requested !== 'INACTIVE')) {
      if (requested === 'INACTIVE') {
        return {
          status: EntityStatus.INACTIVE,
          isVisible: false,
          visibility: Visibility.HIDDEN,
        };
      }
      if (!publish && requested !== 'ACTIVE' && requested !== 'SCHEDULED') {
        return {
          status: EntityStatus.DRAFT,
          isVisible: false,
          visibility: Visibility.HIDDEN,
        };
      }
    }
    if (requested === 'INACTIVE') {
      return {
        status: EntityStatus.INACTIVE,
        isVisible: false,
        visibility: Visibility.HIDDEN,
      };
    }
    return {
      status: EntityStatus.ACTIVE,
      isVisible: true,
      visibility: this.resolveVisibility(true, startsAt),
    };
  }

  private resolveVisibility(publish: boolean, startsAt?: string | null): Visibility {
    if (!publish) return Visibility.HIDDEN;
    if (startsAt && new Date(startsAt).getTime() > Date.now()) {
      return Visibility.SCHEDULED;
    }
    return Visibility.PUBLIC;
  }

  private assertSchedule(startsAt?: string, endsAt?: string) {
    if (!startsAt || !endsAt) return;
    const start = parsePromotionStartAt(startsAt).getTime();
    const end = parsePromotionEndAt(endsAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      throw new BadRequestException('End date must be on or after the start date');
    }
  }

  private assertCta(enabled?: boolean, value?: string | null) {
    if (enabled && !value?.trim()) {
      throw new BadRequestException('CTA destination is required when CTA is enabled');
    }
  }

  private assertBanner(bannerImage?: string | null, mobileBannerImage?: string | null) {
    if (!bannerImage?.trim() && !mobileBannerImage?.trim()) {
      throw new BadRequestException('Upload a mobile banner image before publishing');
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    const trimmed = (base || 'delivery-promotion').slice(0, 100);
    const existing = await this.prisma.deliveryPromotion.findUnique({
      where: { slug: trimmed },
      select: { id: true },
    });
    if (!existing) return trimmed;
    return `${trimmed}-${Date.now().toString(36)}`.slice(0, 120);
  }
}
