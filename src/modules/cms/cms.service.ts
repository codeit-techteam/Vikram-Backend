import { Injectable } from '@nestjs/common';
import {
  BannerPlacement,
  BannerType,
  EntityStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { VISIBLE_WHERE } from '../../common/utils/prisma.util';
import {
  CmsAdvertisementDto,
  CmsBannerDto,
  CmsHomeResponseDto,
  CmsHomeSectionDto,
  CmsPromotionDto,
  CmsTestimonialDto,
} from './dto/cms-response.dto';

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getHome(): Promise<CmsHomeResponseDto> {
    const cached = await this.cache.get<CmsHomeResponseDto>(CACHE_KEYS.CMS_HOME);
    if (cached) return cached;

    const [
      sections,
      banners,
      ads,
      testimonials,
      promotions,
      videoBanners,
    ] = await Promise.all([
      this.getHomeSections(),
      this.getBanners(),
      this.getAds(),
      this.getTestimonials(),
      this.getPromotions(),
      this.getVideoBanners(),
    ]);

    const result: CmsHomeResponseDto = {
      sections,
      banners,
      ads,
      testimonials,
      promotions,
      videoBanners,
      emergencyDelivery:
        promotions.find((p) => p.cardType === 'EMERGENCY_DELIVERY') ?? null,
      bulkProcurement:
        promotions.find((p) => p.cardType === 'BULK_PROCUREMENT') ?? null,
      priorityExpress:
        promotions.find((p) => p.cardType === 'PRIORITY_EXPRESS') ?? null,
      membership: promotions.find((p) => p.cardType === 'MEMBERSHIP') ?? null,
    };

    await this.cache.set(CACHE_KEYS.CMS_HOME, result, CACHE_TTL.CMS_HOME);
    return result;
  }

  async getBanners(): Promise<CmsBannerDto[]> {
    const cached = await this.cache.get<CmsBannerDto[]>(CACHE_KEYS.CMS_BANNERS);
    if (cached) return cached;

    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        ...VISIBLE_WHERE,
        placement: {
          in: [
            BannerPlacement.HOME_HERO,
            BannerPlacement.HOME_PROMO,
            BannerPlacement.EMERGENCY_DELIVERY,
            BannerPlacement.BULK_PROCUREMENT,
          ],
        },
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = banners.map((b) => this.mapBanner(b));
    await this.cache.set(CACHE_KEYS.CMS_BANNERS, result, CACHE_TTL.BANNERS);
    return result;
  }

  async getAds(): Promise<CmsAdvertisementDto[]> {
    const cached = await this.cache.get<CmsAdvertisementDto[]>(CACHE_KEYS.CMS_ADS);
    if (cached) return cached;

    const ads = await this.prisma.advertisement.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = ads.map((a) => ({
      id: a.id,
      title: a.title,
      brandName: a.brandName,
      description: a.description,
      imageUrl: a.imageUrl,
      buttonText: a.buttonText,
      redirectType: a.redirectType,
      redirectId: a.redirectId,
      displayOrder: a.displayOrder,
      priority: a.priority,
      isActive: a.isActive,
    }));

    await this.cache.set(CACHE_KEYS.CMS_ADS, result, CACHE_TTL.ADS);
    return result;
  }

  async getTestimonials(): Promise<CmsTestimonialDto[]> {
    const cached = await this.cache.get<CmsTestimonialDto[]>(
      CACHE_KEYS.CMS_TESTIMONIALS,
    );
    if (cached) return cached;

    const items = await this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const result = items.map((t) => ({
      id: t.id,
      customerName: t.customerName,
      designation: t.designation,
      city: t.city ?? t.location,
      location: t.location,
      rating: t.rating,
      review: t.review,
      thumbnailUrl: t.thumbnail,
      videoUrl: t.videoUrl,
      profileImage: t.profileImage ?? t.imageUrl,
      imageUrl: t.imageUrl,
      displayOrder: t.sortOrder,
      featured: t.featured,
      isActive: t.isPublished,
      type: t.type,
    }));

    await this.cache.set(
      CACHE_KEYS.CMS_TESTIMONIALS,
      result,
      CACHE_TTL.TESTIMONIALS,
    );
    return result;
  }

  async getPromotions(): Promise<CmsPromotionDto[]> {
    const cached = await this.cache.get<CmsPromotionDto[]>(
      CACHE_KEYS.CMS_PROMOTIONS,
    );
    if (cached) return cached;

    const cards = await this.prisma.promotionalCard.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = cards.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      description: c.description,
      imageUrl: c.imageUrl,
      buttonText: c.buttonText,
      badge: c.badge,
      benefits: Array.isArray(c.benefits)
        ? (c.benefits as string[])
        : null,
      redirectType: c.redirectType,
      redirectId: c.redirectId,
      cardType: c.cardType,
      priority: c.priority,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
    }));

    await this.cache.set(CACHE_KEYS.CMS_PROMOTIONS, result, CACHE_TTL.PROMOTIONS);
    return result;
  }

  async getHomeSections(): Promise<CmsHomeSectionDto[]> {
    const cached = await this.cache.get<CmsHomeSectionDto[]>(
      CACHE_KEYS.CMS_HOME_SECTIONS,
    );
    if (cached) return cached;

    const sections = await this.prisma.homeSection.findMany({
      where: { enabled: true },
      orderBy: [{ displayOrder: 'asc' }],
    });

    const result = sections.map((s) => ({
      id: s.id,
      sectionType: s.sectionType,
      title: s.title,
      subtitle: s.subtitle,
      displayOrder: s.displayOrder,
      enabled: s.enabled,
      apiSource: s.apiSource,
      layoutType: s.layoutType,
    }));

    await this.cache.set(
      CACHE_KEYS.CMS_HOME_SECTIONS,
      result,
      CACHE_TTL.HOME_SECTIONS,
    );
    return result;
  }

  private async getVideoBanners(): Promise<CmsBannerDto[]> {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        ...VISIBLE_WHERE,
        bannerType: BannerType.VIDEO,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    if (banners.length > 0) {
      return banners.map((b) => this.mapBanner(b));
    }

    // Fallback: HOME placement videos table
    const videos = await this.prisma.video.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        status: EntityStatus.ACTIVE,
        placement: 'HOME',
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    return videos.map((v, index) => ({
      id: v.id,
      title: v.title,
      subtitle: v.description,
      buttonText: 'Shop Now',
      buttonAction: v.linkTarget ? 'product' : null,
      bannerType: BannerType.VIDEO,
      imageUrl: v.thumbnailUrl ?? '',
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl,
      badge: null,
      priority: v.priority,
      displayOrder: v.displayOrder || index,
      isActive: true,
      startDate: null,
      endDate: null,
      linkUrl: v.linkUrl,
      linkType: v.linkTarget ? 'product' : null,
      linkTarget: v.linkTarget,
      secondaryButtonText: null,
      secondaryLinkUrl: null,
      secondaryLinkType: null,
      secondaryLinkTarget: null,
      placement: 'HOME',
    }));
  }

  private mapBanner(b: {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    badge: string | null;
    bannerType: BannerType;
    ctaLabel: string | null;
    buttonAction: string | null;
    linkUrl: string | null;
    linkType: string | null;
    linkTarget: string | null;
    secondaryCtaLabel: string | null;
    secondaryLinkUrl: string | null;
    secondaryLinkType: string | null;
    secondaryLinkTarget: string | null;
    placement: BannerPlacement;
    displayOrder: number;
    priority: number;
    startsAt: Date | null;
    endsAt: Date | null;
    isVisible: boolean;
  }): CmsBannerDto {
    return {
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      buttonText: b.ctaLabel,
      buttonAction: b.buttonAction ?? b.linkType,
      bannerType: b.bannerType,
      imageUrl: b.imageUrl,
      videoUrl: b.videoUrl,
      thumbnailUrl: b.thumbnailUrl,
      badge: b.badge,
      priority: b.priority,
      displayOrder: b.displayOrder,
      isActive: b.isVisible,
      startDate: b.startsAt,
      endDate: b.endsAt,
      linkUrl: b.linkUrl,
      linkType: b.linkType,
      linkTarget: b.linkTarget,
      secondaryButtonText: b.secondaryCtaLabel,
      secondaryLinkUrl: b.secondaryLinkUrl,
      secondaryLinkType: b.secondaryLinkType,
      secondaryLinkTarget: b.secondaryLinkTarget,
      placement: b.placement,
    };
  }
}
