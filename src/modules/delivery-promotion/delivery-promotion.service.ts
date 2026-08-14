import { Injectable, Logger } from '@nestjs/common';
import {
  BannerTargetAudience,
  DeliveryPromotionPlacement,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { normalizeMediaUrl } from '../../common/utils/media-url';
import { DeliveryBenefitService } from '../delivery/delivery-benefit.service';
import {
  CUSTOMER_DELIVERY_PROMOTION_ORDER_BY,
  customerDeliveryPromotionWhere,
  personalizeDeliveryPromotion,
} from './delivery-promotion.logic';
import type { DeliveryPromotionDto } from './dto/delivery-promotion-response.dto';

function media(url?: string | null): string | null {
  return normalizeMediaUrl(url);
}

@Injectable()
export class DeliveryPromotionService {
  private readonly logger = new Logger(DeliveryPromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly deliveryBenefit: DeliveryBenefitService,
  ) {}

  async getEligiblePromotions(
    customerId?: string | null,
  ): Promise<DeliveryPromotionDto[]> {
    const now = new Date();
    const cacheKey = customerId
      ? CACHE_KEYS.CMS_DELIVERY_PROMOTIONS_CUSTOMER(customerId)
      : CACHE_KEYS.CMS_DELIVERY_PROMOTIONS;

    const cached = await this.cache.get<DeliveryPromotionDto[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.deliveryPromotion.findMany({
      where: {
        ...customerDeliveryPromotionWhere(now),
        placement: DeliveryPromotionPlacement.HOME_TOP_DELIVERY_PROMOTION,
      },
      orderBy: CUSTOMER_DELIVERY_PROMOTION_ORDER_BY,
    });

    const ctx = customerId
      ? await this.audienceContext(customerId)
      : { isLoggedIn: false, remainingCount: 3, usedCount: 0 };

    const mapped = rows
      .map((row) => personalizeDeliveryPromotion(row, ctx))
      .filter((item) => item.eligible)
      .map((item) => this.toPublicDto(item.promo))
      .filter((item) => Boolean(item.bannerImage));

    await this.cache.set(cacheKey, mapped, CACHE_TTL.BANNERS);
    return mapped;
  }

  /** Highest-priority eligible promotion only — Home shows a single strip. */
  async getFeaturedPromotion(
    customerId?: string | null,
  ): Promise<DeliveryPromotionDto | null> {
    const items = await this.getEligiblePromotions(customerId);
    return items[0] ?? null;
  }

  private async audienceContext(customerId: string) {
    try {
      const summary = await this.deliveryBenefit.getSummary(customerId);
      return {
        isLoggedIn: true,
        remainingCount: summary.remainingCount,
        usedCount: summary.usedCount,
      };
    } catch (error) {
      this.logger.warn(
        `Delivery benefit lookup failed for ${customerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { isLoggedIn: true, remainingCount: 3, usedCount: 0 };
    }
  }

  private toPublicDto(row: {
    id: string;
    headline: string;
    subtitle: string | null;
    badge: string | null;
    bannerImage: string;
    mobileBannerImage: string | null;
    desktopBannerImage: string | null;
    placement: DeliveryPromotionPlacement | string;
    ctaEnabled: boolean;
    ctaLabel: string | null;
    ctaType: string | null;
    ctaValue: string | null;
    priority: number;
    startsAt: Date | null;
    endsAt: Date | null;
    targetAudience: BannerTargetAudience | string;
  }): DeliveryPromotionDto {
    const bannerImage =
      media(row.mobileBannerImage) ||
      media(row.bannerImage) ||
      media(row.desktopBannerImage) ||
      '';

    return {
      id: row.id,
      title: row.headline,
      subtitle: row.subtitle,
      badge: row.badge,
      bannerImage,
      mobileBannerImage: media(row.mobileBannerImage),
      desktopBannerImage: media(row.desktopBannerImage),
      placement: String(row.placement),
      cta: {
        enabled: row.ctaEnabled,
        label: row.ctaLabel,
        type: row.ctaEnabled ? row.ctaType : 'NONE',
        value: row.ctaEnabled ? row.ctaValue : null,
      },
      priority: row.priority,
      startAt: row.startsAt,
      endAt: row.endsAt,
      targetAudience: String(row.targetAudience),
    };
  }
}
