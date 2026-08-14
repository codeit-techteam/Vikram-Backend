import { Injectable } from '@nestjs/common';
import { VideoPlacement } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { VISIBLE_WHERE } from '../../common/utils/prisma.util';
import { VideoResponseDto } from './dto/video-response.dto';

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(placement?: VideoPlacement): Promise<VideoResponseDto[]> {
    const cacheKey = CACHE_KEYS.VIDEOS(placement);
    const cached = await this.cache.get<VideoResponseDto[]>(cacheKey);
    if (cached) return cached;

    const videos = await this.prisma.video.findMany({
      where: {
        ...VISIBLE_WHERE,
        ...(placement ? { placement } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });

    const result = videos.map((v) => ({
      id: v.id,
      slug: v.slug,
      title: v.title,
      description: v.description,
      videoUrl: v.videoUrl,
      thumbnail: null,
      thumbnailUrl: null,
      placement: v.placement,
      linkUrl: v.linkUrl,
      linkType: v.linkType,
      linkTarget: v.linkTarget,
      ctaLabel: v.ctaLabel,
      duration: v.duration,
      displayOrder: v.displayOrder,
      isVisible: v.isVisible,
    }));

    await this.cache.set(cacheKey, result, CACHE_TTL.VIDEOS);
    return result;
  }
}
