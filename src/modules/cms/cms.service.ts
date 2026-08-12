import { Injectable } from '@nestjs/common';
import {
  BannerPlacement,
  BannerType,
  EntityStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { R2StorageService } from '../../storage/r2.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { VISIBLE_WHERE } from '../../common/utils/prisma.util';
import { normalizeMediaUrl } from '../../common/utils/media-url';
import {
  CmsAdvertisementDto,
  CmsBannerDto,
  CmsCategoryDto,
  CmsEmergencyBannerDto,
  CmsHomeResponseDto,
  CmsHomeSectionDto,
  CmsOfferDto,
  CmsPromotionDto,
  CmsQuickActionDto,
  CmsTestimonialDto,
} from './dto/cms-response.dto';

function media(url?: string | null): string | null {
  const normalized = normalizeMediaUrl(url);
  if (!normalized) return null;
  // Google sample bucket often returns AccessDenied — never serve to app/admin.
  if (
    normalized.includes('commondatastorage.googleapis.com') ||
    normalized.includes('gtv-videos-bucket')
  ) {
    return null;
  }
  return normalized;
}

const scheduleFilter = (now: Date) => ({
  OR: [
    { startsAt: null, endsAt: null },
    { startsAt: { lte: now }, endsAt: null },
    { startsAt: null, endsAt: { gte: now } },
    { startsAt: { lte: now }, endsAt: { gte: now } },
  ],
});

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  async getHome(): Promise<CmsHomeResponseDto> {
    // Skip Redis cache when R2 uses signed URLs (they must be refreshed).
    const useCache = this.storage.hasPublicBaseUrl();
    if (useCache) {
      const cached = await this.cache.get<CmsHomeResponseDto>(CACHE_KEYS.CMS_HOME);
      if (cached) return cached;
    }

    const [
      sections,
      banners,
      ads,
      testimonials,
      promotions,
      videoBanners,
      offers,
      quickActions,
      emergencyBanner,
      categories,
    ] = await Promise.all([
      this.getHomeSections(),
      this.getBanners(),
      this.getAds(),
      this.getTestimonials(),
      this.getPromotions(),
      this.getVideoBanners(),
      this.getOffersForYou(),
      this.getQuickActions(),
      this.getEmergencyBanner(),
      this.getCategories(),
    ]);

    const result: CmsHomeResponseDto = {
      sections,
      banners,
      heroBanners: banners.filter((b) => b.placement === 'HOME_HERO'),
      promoBanners: banners.filter((b) => b.placement === 'HOME_PROMO'),
      ads,
      brandAdvertisements: ads,
      catalogs: ads,
      categories,
      testimonials,
      promotions,
      videoBanners,
      heroVideo: videoBanners[0] ?? null,
      offers,
      quickActions,
      emergencyBanner,
      emergencyDelivery:
        promotions.find((p) => p.cardType === 'EMERGENCY_DELIVERY') ?? null,
      bulkProcurement:
        promotions.find((p) => p.cardType === 'BULK_PROCUREMENT') ?? null,
      priorityExpress:
        promotions.find((p) => p.cardType === 'PRIORITY_EXPRESS') ?? null,
      membership: promotions.find((p) => p.cardType === 'MEMBERSHIP') ?? null,
    };

    if (useCache) {
      await this.cache.set(CACHE_KEYS.CMS_HOME, result, CACHE_TTL.CMS_HOME);
    }
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
        ...scheduleFilter(now),
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

    const now = new Date();
    const ads = await this.prisma.advertisement.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = ads.map((a) => ({
      id: a.id,
      title: a.title,
      brandName: a.brandName,
      description: a.description,
      imageUrl: media(a.imageUrl) ?? a.imageUrl,
      logoUrl: media(a.logoUrl),
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
      // Video testimonials do not use a separate poster — app generates a frame from videoUrl.
      thumbnailUrl: t.type === 'VIDEO' ? null : media(t.thumbnail),
      videoUrl: media(t.videoUrl),
      profileImage: media(t.profileImage ?? t.imageUrl),
      imageUrl: media(t.imageUrl),
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

    const now = new Date();
    const cards = await this.prisma.promotionalCard.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = cards.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      description: c.description,
      imageUrl: media(c.imageUrl),
      buttonText: c.buttonText,
      badge: c.badge,
      benefits: Array.isArray(c.benefits) ? (c.benefits as string[]) : null,
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

  async getCategories(): Promise<CmsCategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        ...VISIBLE_WHERE,
        parentId: null,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      nameHi: c.nameHi,
      description: c.description,
      imageUrl: media(c.imageUrl),
      iconUrl: media(c.iconUrl),
      displayOrder: c.displayOrder,
      isFeatured: c.isFeatured,
    }));
  }

  async getOffersForYou(): Promise<CmsOfferDto[]> {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        ...VISIBLE_WHERE,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
      take: 20,
    });

    return offers.map((o) => ({
      id: o.id,
      slug: o.slug,
      title: o.title,
      description: o.description,
      imageUrl: media(o.imageUrl),
      discountLabel: o.discountLabel ?? o.badge,
      badge: o.badge,
      offerType: o.offerType,
      displayOrder: o.displayOrder,
      priority: o.priority,
      endsAt: o.endsAt,
    }));
  }

  async getQuickActions(): Promise<CmsQuickActionDto[]> {
    const now = new Date();
    const actions = await this.prisma.quickAction.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }],
    });

    return actions.map((a) => ({
      id: a.id,
      label: a.label,
      iconUrl: media(a.iconUrl),
      iconKey: a.iconKey,
      redirectType: a.redirectType,
      redirectId: a.redirectId,
      displayOrder: a.displayOrder,
    }));
  }

  async getEmergencyBanner(): Promise<CmsEmergencyBannerDto | null> {
    const now = new Date();

    const promo = await this.prisma.promotionalCard.findFirst({
      where: {
        cardType: 'EMERGENCY_BANNER',
        isActive: true,
        deletedAt: null,
        ...scheduleFilter(now),
      },
      orderBy: [{ priority: 'desc' }, { displayOrder: 'asc' }],
    });

    if (promo) {
      return {
        id: promo.id,
        title: promo.title,
        body: promo.subtitle ?? promo.description,
        imageUrl: media(promo.imageUrl),
        linkUrl: promo.redirectId,
        linkTarget: promo.redirectId,
        dismissible: true,
      };
    }

    const announcement = await this.prisma.announcement.findFirst({
      where: {
        ...VISIBLE_WHERE,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }],
    });

    if (!announcement) return null;

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      imageUrl: media(announcement.imageUrl),
      linkUrl: announcement.linkUrl,
      linkTarget: announcement.linkTarget,
      dismissible: true,
    };
  }

  async getPublicVideos(): Promise<CmsBannerDto[]> {
    return this.getVideoBanners();
  }

  private async getVideoBanners(): Promise<CmsBannerDto[]> {
    const now = new Date();

    // Prefer R2-backed Video records for HOME hero
    const videos = await this.prisma.video.findMany({
      where: {
        deletedAt: null,
        published: true,
        isVisible: true,
        status: EntityStatus.ACTIVE,
        placement: { in: ['HOME', 'HOME_HERO_VIDEO'] },
        AND: [
          { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { displayOrder: 'asc' }, { updatedAt: 'desc' }],
    });

    if (videos.length > 0) {
      return Promise.all(
        videos.map(async (v, index) => {
          const videoUrl = await this.storage.resolveReadableUrl(
            v.publicUrl || v.videoUrl,
            v.storageKey,
          );
          const thumbnailUrl = v.thumbnailKey
            ? await this.storage.resolveReadableUrl(
                v.thumbnailUrl || '',
                v.thumbnailKey,
              )
            : media(v.thumbnailUrl);

          return {
            id: v.id,
            title: v.title,
            subtitle: v.description,
            buttonText: v.ctaLabel || 'Shop Now',
            buttonAction: v.linkUrl ? 'route' : null,
            bannerType: BannerType.VIDEO,
            imageUrl: thumbnailUrl ?? '',
            videoUrl,
            thumbnailUrl,
            badge: null,
            priority: v.priority,
            displayOrder: v.displayOrder || index,
            isActive: true,
            startDate: v.scheduledAt,
            endDate: v.expiresAt,
            linkUrl: v.linkUrl,
            linkType: v.linkUrl ? 'ROUTE' : null,
            linkTarget: v.linkTarget || v.linkUrl,
            secondaryButtonText: null,
            secondaryLinkUrl: null,
            secondaryLinkType: null,
            secondaryLinkTarget: null,
            placement: 'HOME_HERO_VIDEO',
          };
        }),
      );
    }

    const banners = await this.prisma.banner.findMany({
      where: {
        ...VISIBLE_WHERE,
        bannerType: BannerType.VIDEO,
        ...scheduleFilter(now),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    return banners.map((b) => this.mapBanner(b));
  }

  private mapBanner(b: {
    id: string;
    title: string;
    subtitle: string | null;
    imageUrl: string;
    mobileUrl?: string | null;
    tabletUrl?: string | null;
    desktopUrl?: string | null;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    badge: string | null;
    bannerType: BannerType;
    ctaLabel: string | null;
    ctaColor?: string | null;
    backgroundColor?: string | null;
    buttonAction: string | null;
    linkUrl: string | null;
    linkType: string | null;
    linkTarget: string | null;
    secondaryCtaLabel: string | null;
    secondaryLinkUrl: string | null;
    secondaryLinkType: string | null;
    secondaryLinkTarget: string | null;
    placement: BannerPlacement | string;
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
      imageUrl: media(b.mobileUrl || b.imageUrl) ?? '',
      mobileUrl: media(b.mobileUrl),
      tabletUrl: media(b.tabletUrl),
      desktopUrl: media(b.desktopUrl),
      videoUrl: media(b.videoUrl),
      thumbnailUrl: media(b.thumbnailUrl),
      badge: b.badge,
      ctaColor: b.ctaColor,
      backgroundColor: b.backgroundColor,
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
      placement: b.placement as string,
    };
  }
}
