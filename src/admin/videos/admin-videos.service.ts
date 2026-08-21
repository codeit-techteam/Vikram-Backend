import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EntityStatus,
  VideoPlacement,
  Visibility,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { R2StorageService } from '../../storage/r2.service';
import { MEDIA_FOLDERS } from '../../storage/media-folders';
import type { CreateVideoDto, UpdateVideoDto } from './dto/admin-videos.dto';
import { resolveVideoCta } from './video-cta.util';

function persistCta(fields: {
  linkType?: string | null;
  linkUrl?: string | null;
  linkTarget?: string | null;
}) {
  const cta = resolveVideoCta(fields);
  return {
    linkType: cta.linkType,
    linkUrl: cta.linkUrl,
    linkTarget:
      cta.linkTarget && cta.linkTarget.length <= 200 ? cta.linkTarget : null,
  };
}

function mapPlacement(value?: string | null): VideoPlacement {
  const raw = (value || 'HOME_HERO_VIDEO').toUpperCase();
  if (raw === 'HOME') return VideoPlacement.HOME;
  if (raw === 'CATEGORY') return VideoPlacement.CATEGORY;
  if (raw === 'PRODUCT') return VideoPlacement.PRODUCT;
  if (raw === 'TUTORIALS') return VideoPlacement.TUTORIALS;
  return VideoPlacement.HOME_HERO_VIDEO;
}

@Injectable()
export class AdminVideosService {
  private readonly logger = new Logger(AdminVideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  async findAll(placement?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (placement) where['placement'] = mapPlacement(placement);
    const rows = await this.prisma.video.findMany({
      where,
      orderBy: [
        { updatedAt: 'desc' },
        { priority: 'desc' },
        { displayOrder: 'asc' },
      ],
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `Fetched videos count=${rows.length} ids=[${rows.map((r) => r.id).join(', ')}]`,
      );
      for (const row of rows) {
        this.logger.debug(
          `video id=${row.id} placement=${row.placement} status=${row.status} published=${row.published} thumb=${row.thumbnailUrl} url=${row.publicUrl || row.videoUrl}`,
        );
      }
    }

    return Promise.all(rows.map((row) => this.serialize(row)));
  }

  async findOne(id: string) {
    const video = await this.prisma.video.findFirst({
      where: { id, deletedAt: null },
    });
    if (!video) throw new NotFoundException('Video not found');
    return this.serialize(video);
  }

  private async serialize<
    T extends {
      sizeBytes?: bigint | null;
      storageKey?: string | null;
      videoUrl?: string;
      publicUrl?: string | null;
      thumbnailUrl?: string | null;
      thumbnailKey?: string | null;
      linkType?: string | null;
      linkUrl?: string | null;
      linkTarget?: string | null;
      placement?: VideoPlacement | string;
      published?: boolean;
    },
  >(row: T) {
    const readableVideo = row.storageKey
      ? await this.storage.resolveReadableUrl(
          row.publicUrl || row.videoUrl || '',
          row.storageKey,
        )
      : row.publicUrl || row.videoUrl || null;

    const readableThumb = row.thumbnailKey
      ? await this.storage.resolveReadableUrl(
          row.thumbnailUrl || '',
          row.thumbnailKey,
        )
      : row.thumbnailUrl;

    return {
      ...row,
      videoUrl: readableVideo || row.videoUrl,
      publicUrl: readableVideo || row.publicUrl,
      thumbnailUrl: readableThumb || row.thumbnailUrl,
      sizeBytes:
        row.sizeBytes === null || row.sizeBytes === undefined
          ? null
          : Number(row.sizeBytes),
    };
  }

  async create(dto: CreateVideoDto, createdBy?: string) {
    if (!dto.videoUrl?.trim()) {
      throw new BadRequestException(
        'videoUrl is required when not uploading a file',
      );
    }

    const placement = mapPlacement(dto.placement);
    const publish = Boolean(dto.publish);
    const cta = persistCta(dto);

    const video = await this.prisma.video.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        videoUrl: dto.videoUrl,
        publicUrl: dto.videoUrl,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        placement,
        ...cta,
        ctaLabel: dto.ctaLabel ?? 'Shop Now',
        duration: dto.duration,
        displayOrder: dto.displayOrder ?? 0,
        priority: dto.priority ?? 0,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: createdBy ?? null,
        status: publish ? EntityStatus.ACTIVE : EntityStatus.DRAFT,
        isVisible: publish,
        published: publish,
        visibility: Visibility.PUBLIC,
      },
    });

    if (publish && this.isHeroPlacement(placement)) {
      await this.demoteOtherHeroes(video.id);
      await this.syncHeroVideoBanner(video.id);
    }

    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async uploadAndCreate(
    file: Express.Multer.File,
    fields: {
      title: string;
      slug?: string;
      description?: string;
      placement?: string;
      linkType?: string;
      linkUrl?: string;
      linkTarget?: string;
      ctaLabel?: string;
      priority?: number;
      displayOrder?: number;
      duration?: number;
      publish?: boolean | string;
      scheduledAt?: string;
      expiresAt?: string;
      thumbnailUrl?: string;
    },
    createdBy?: string,
    thumbnailFile?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('video file is required');

    const folder =
      mapPlacement(fields.placement) === VideoPlacement.TUTORIALS
        ? MEDIA_FOLDERS.VIDEOS_TUTORIALS
        : MEDIA_FOLDERS.VIDEOS_HOME;

    const uploaded = await this.storage.uploadMulterFile(file, folder);

    let thumbnailUrl = fields.thumbnailUrl?.trim() || null;
    let thumbnailKey: string | null = null;
    if (thumbnailFile) {
      const thumb = await this.storage.uploadMulterFile(
        thumbnailFile,
        MEDIA_FOLDERS.THUMBNAILS,
      );
      thumbnailUrl = thumb.publicUrl;
      thumbnailKey = thumb.key;
    }

    const slug =
      fields.slug?.trim() ||
      fields.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100) ||
      `video-${Date.now()}`;

    const publish =
      fields.publish === true ||
      fields.publish === 'true' ||
      fields.publish === '1';

    const placement = mapPlacement(fields.placement);
    const cta = persistCta(fields);

    const video = await this.prisma.video.create({
      data: {
        title: fields.title,
        slug: `${slug}-${Date.now().toString(36)}`.slice(0, 120),
        description: fields.description,
        storageKey: uploaded.key,
        videoUrl: uploaded.publicUrl,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl,
        thumbnailKey,
        mimeType: uploaded.mimeType,
        sizeBytes: BigInt(uploaded.size),
        placement,
        ...cta,
        ctaLabel: fields.ctaLabel ?? 'Shop Now',
        duration: fields.duration ? Number(fields.duration) : null,
        displayOrder: fields.displayOrder ? Number(fields.displayOrder) : 0,
        priority: fields.priority ? Number(fields.priority) : 10,
        scheduledAt: fields.scheduledAt ? new Date(fields.scheduledAt) : null,
        expiresAt: fields.expiresAt ? new Date(fields.expiresAt) : null,
        createdBy: createdBy ?? null,
        status: publish ? EntityStatus.ACTIVE : EntityStatus.DRAFT,
        isVisible: publish,
        published: publish,
        visibility: Visibility.PUBLIC,
      },
    });

    if (publish && this.isHeroPlacement(placement)) {
      await this.demoteOtherHeroes(video.id);
      await this.syncHeroVideoBanner(video.id);
    }

    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async replaceFile(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('video file is required');
    const existing = await this.findOne(id);
    const folder =
      mapPlacement(String(existing.placement ?? '')) ===
      VideoPlacement.TUTORIALS
        ? MEDIA_FOLDERS.VIDEOS_TUTORIALS
        : MEDIA_FOLDERS.VIDEOS_HOME;

    const uploaded = await this.storage.uploadMulterFile(file, folder);
    if (existing.storageKey && existing.storageKey !== uploaded.key) {
      try {
        await this.storage.deleteFile(existing.storageKey);
      } catch {
        // Keep the new object even if the old key cannot be deleted
      }
    }

    const video = await this.prisma.video.update({
      where: { id },
      data: {
        storageKey: uploaded.key,
        videoUrl: uploaded.publicUrl,
        publicUrl: uploaded.publicUrl,
        mimeType: uploaded.mimeType,
        sizeBytes: BigInt(uploaded.size),
      },
    });

    if (
      video.published &&
      this.isHeroPlacement(mapPlacement(String(video.placement ?? '')))
    ) {
      await this.syncHeroVideoBanner(id);
    }

    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async update(id: string, dto: UpdateVideoDto) {
    await this.findOne(id);
    const placement = dto.placement ? mapPlacement(dto.placement) : undefined;

    const video = await this.prisma.video.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.videoUrl !== undefined && {
          videoUrl: dto.videoUrl,
          publicUrl: dto.videoUrl,
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
        ...(placement && { placement }),
        ...((dto.linkType !== undefined ||
          dto.linkUrl !== undefined ||
          dto.linkTarget !== undefined) &&
          persistCta({
            linkType: dto.linkType,
            linkUrl: dto.linkUrl,
            linkTarget: dto.linkTarget,
          })),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.scheduledAt !== undefined && {
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
        ...(dto.published !== undefined && {
          published: dto.published,
          isVisible: dto.published,
          status: dto.published ? EntityStatus.ACTIVE : EntityStatus.INACTIVE,
        }),
      },
    });

    if (
      video.published &&
      this.isHeroPlacement(mapPlacement(String(video.placement ?? '')))
    ) {
      await this.demoteOtherHeroes(video.id);
      await this.syncHeroVideoBanner(video.id);
    }

    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    const wasLiveHero =
      Boolean(existing.published) &&
      this.isHeroPlacement(mapPlacement(String(existing.placement ?? '')));
    if (existing.storageKey) {
      try {
        await this.storage.deleteFile(existing.storageKey);
      } catch {
        // Keep DB soft-delete even if R2 delete fails
      }
    }
    if (existing.thumbnailKey) {
      try {
        await this.storage.deleteFile(existing.thumbnailKey);
      } catch {
        // ignore
      }
    }
    const video = await this.prisma.video.update({
      where: { id },
      data: { deletedAt: new Date(), published: false, isVisible: false },
    });
    if (wasLiveHero) {
      await this.promoteNextHero(id);
    }
    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async publish(id: string) {
    const existing = await this.findOne(id);
    const video = await this.prisma.video.update({
      where: { id },
      data: {
        status: EntityStatus.ACTIVE,
        isVisible: true,
        published: true,
        visibility: Visibility.PUBLIC,
      },
    });
    if (this.isHeroPlacement(mapPlacement(String(existing.placement ?? '')))) {
      await this.demoteOtherHeroes(id);
      await this.syncHeroVideoBanner(id);
    }
    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async unpublish(id: string) {
    const existing = await this.findOne(id);
    const wasLiveHero =
      Boolean(existing.published) &&
      this.isHeroPlacement(mapPlacement(String(existing.placement ?? '')));
    const video = await this.prisma.video.update({
      where: { id },
      data: {
        status: EntityStatus.INACTIVE,
        isVisible: false,
        published: false,
      },
    });
    if (wasLiveHero) {
      await this.promoteNextHero(id);
    }
    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async archive(id: string) {
    const existing = await this.findOne(id);
    const wasLiveHero =
      Boolean(existing.published) &&
      this.isHeroPlacement(mapPlacement(String(existing.placement ?? '')));
    const video = await this.prisma.video.update({
      where: { id },
      data: {
        status: EntityStatus.INACTIVE,
        isVisible: false,
        published: false,
      },
    });
    if (wasLiveHero) {
      await this.promoteNextHero(id);
    }
    await this.cache.invalidateVideos();
    return this.serialize(video);
  }

  async setStatus(id: string, status: 'publish' | 'unpublish' | 'archive') {
    if (status === 'publish') return this.publish(id);
    if (status === 'archive') return this.archive(id);
    return this.unpublish(id);
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.video.update({
          where: { id: item.id },
          data: {
            displayOrder: item.displayOrder,
            priority: 100 - item.displayOrder,
          },
        }),
      ),
    );
    await this.cache.invalidateVideos();
    return { reordered: items.length };
  }

  private isHeroPlacement(placement: VideoPlacement): boolean {
    return (
      placement === VideoPlacement.HOME ||
      placement === VideoPlacement.HOME_HERO_VIDEO
    );
  }

  /** Newest published hero replaces previous heroes (kept so delete can restore them). */
  private async demoteOtherHeroes(keepId: string) {
    await this.prisma.video.updateMany({
      where: {
        deletedAt: null,
        id: { not: keepId },
        placement: {
          in: [VideoPlacement.HOME, VideoPlacement.HOME_HERO_VIDEO],
        },
        OR: [{ published: true }, { isVisible: true }],
      },
      data: {
        published: false,
        isVisible: false,
        status: EntityStatus.INACTIVE,
      },
    });
  }

  /** After the live hero is deleted/unpublished, restore the previous home video. */
  private async promoteNextHero(exceptId: string) {
    const next = await this.prisma.video.findFirst({
      where: {
        deletedAt: null,
        id: { not: exceptId },
        placement: {
          in: [VideoPlacement.HOME, VideoPlacement.HOME_HERO_VIDEO],
        },
        OR: [
          { storageKey: { not: null } },
          { videoUrl: { not: '' } },
          { publicUrl: { not: null } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { priority: 'desc' }],
    });

    if (!next) {
      await this.hideHeroVideoBanner();
      return;
    }

    await this.prisma.video.update({
      where: { id: next.id },
      data: {
        status: EntityStatus.ACTIVE,
        isVisible: true,
        published: true,
        visibility: Visibility.PUBLIC,
      },
    });
    await this.demoteOtherHeroes(next.id);
    await this.syncHeroVideoBanner(next.id);
  }

  private async hideHeroVideoBanner() {
    const existing = await this.prisma.banner.findFirst({
      where: { slug: 'home-hero-video-banner' },
    });
    if (!existing) return;
    await this.prisma.banner.update({
      where: { id: existing.id },
      data: {
        isVisible: false,
        status: EntityStatus.INACTIVE,
        videoUrl: null,
      },
    });
    await this.cache.invalidateBanners();
  }

  /** Keep VIDEO banner in sync so legacy videoBanners consumers stay current. */
  private async syncHeroVideoBanner(videoId: string) {
    const video = await this.findOne(videoId);
    const slug = `home-hero-video-banner`;
    const existing = await this.prisma.banner.findFirst({
      where: { slug },
    });
    const cta = resolveVideoCta({
      linkType: video.linkType,
      linkUrl: video.linkUrl,
      linkTarget: video.linkTarget,
    });
    const playbackUrl = video.publicUrl || video.videoUrl;

    const data = {
      title: video.title,
      subtitle: video.description,
      imageUrl: playbackUrl || '',
      videoUrl: playbackUrl,
      thumbnailUrl: null,
      bannerType: 'VIDEO' as const,
      placement: 'HOME_PROMO' as const,
      ctaLabel: video.ctaLabel || 'Shop Now',
      linkUrl: cta.linkUrl,
      linkType: cta.linkType,
      linkTarget: cta.linkTarget,
      isVisible: video.published,
      status: video.published ? EntityStatus.ACTIVE : EntityStatus.DRAFT,
      priority: video.priority,
      displayOrder: video.displayOrder,
      deletedAt: null,
    };

    if (existing) {
      await this.prisma.banner.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.banner.create({
        data: {
          ...data,
          slug,
        },
      });
    }
    await this.cache.invalidateBanners();
  }
}
