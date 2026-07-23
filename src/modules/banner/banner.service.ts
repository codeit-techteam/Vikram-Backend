import { Injectable } from '@nestjs/common';
import { BannerPlacement } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { VISIBLE_WHERE } from '../../common/utils/prisma.util';
import { BannerResponseDto } from './dto/banner-response.dto';

@Injectable()
export class BannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(placement?: BannerPlacement): Promise<BannerResponseDto[]> {
    const cacheKey = CACHE_KEYS.BANNERS(placement);
    const cached = await this.cache.get<BannerResponseDto[]>(cacheKey);
    if (cached) return cached;

    const now = new Date();

    const banners = await this.prisma.banner.findMany({
      where: {
        ...VISIBLE_WHERE,
        ...(placement ? { placement } : {}),
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = banners.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      subtitle: b.subtitle,
      imageDesktop: b.imageUrl,
      imageMobile: b.mobileUrl ?? b.imageUrl,
      imageUrl: b.imageUrl,
      mobileUrl: b.mobileUrl,
      videoUrl: b.videoUrl,
      thumbnailUrl: b.thumbnailUrl,
      badge: b.badge,
      bannerType: b.bannerType,
      buttonText: b.ctaLabel,
      buttonAction: b.buttonAction ?? b.linkType,
      ctaLabel: b.ctaLabel,
      ctaLink: b.linkUrl,
      linkUrl: b.linkUrl,
      linkType: b.linkType,
      linkTarget: b.linkTarget,
      secondaryButtonText: b.secondaryCtaLabel,
      secondaryLinkUrl: b.secondaryLinkUrl,
      secondaryLinkType: b.secondaryLinkType,
      secondaryLinkTarget: b.secondaryLinkTarget,
      placement: b.placement,
      displayOrder: b.displayOrder,
      priority: b.priority,
      visibility: b.visibility,
      isVisible: b.isVisible,
      startDate: b.startsAt,
      endDate: b.endsAt,
    }));

    await this.cache.set(cacheKey, result, CACHE_TTL.BANNERS);
    return result;
  }
}
