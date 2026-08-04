import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BannerType,
  EntityStatus,
  Visibility,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { R2StorageService } from '../../storage/r2.service';
import type { CreateBannerDto, UpdateBannerDto } from './dto/admin-banners.dto';

@Injectable()
export class AdminBannersService {
  private readonly logger = new Logger(AdminBannersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  async findAll(placement?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (placement) where['placement'] = placement;
    return this.prisma.banner.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findFirst({
      where: { id, deletedAt: null },
    });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async create(dto: CreateBannerDto) {
    const publish = dto.publish === true;
    const banner = await this.prisma.banner.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        imageUrl: dto.imageUrl,
        subtitle: dto.subtitle,
        mobileUrl: dto.mobileUrl,
        tabletUrl: dto.tabletUrl,
        desktopUrl: dto.desktopUrl,
        videoUrl: dto.videoUrl,
        thumbnailUrl: dto.thumbnailUrl,
        badge: dto.badge,
        bannerType: dto.bannerType ?? BannerType.IMAGE,
        ctaLabel: dto.ctaLabel,
        ctaColor: dto.ctaColor,
        backgroundColor: dto.backgroundColor,
        buttonAction: dto.buttonAction,
        linkUrl: dto.linkUrl,
        linkType: dto.linkType,
        linkTarget: dto.linkTarget,
        secondaryCtaLabel: dto.secondaryCtaLabel,
        secondaryLinkUrl: dto.secondaryLinkUrl,
        secondaryLinkType: dto.secondaryLinkType,
        secondaryLinkTarget: dto.secondaryLinkTarget,
        placement: (dto.placement as any) ?? 'HOME_HERO',
        displayOrder: dto.displayOrder ?? 0,
        priority: dto.priority ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: publish ? EntityStatus.ACTIVE : EntityStatus.DRAFT,
        isVisible: publish,
        visibility: Visibility.PUBLIC,
      },
    });
    await this.cache.invalidateBanners();
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.mobileUrl !== undefined && { mobileUrl: dto.mobileUrl }),
        ...(dto.tabletUrl !== undefined && { tabletUrl: dto.tabletUrl }),
        ...(dto.desktopUrl !== undefined && { desktopUrl: dto.desktopUrl }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.bannerType !== undefined && { bannerType: dto.bannerType }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.ctaColor !== undefined && { ctaColor: dto.ctaColor }),
        ...(dto.backgroundColor !== undefined && {
          backgroundColor: dto.backgroundColor,
        }),
        ...(dto.buttonAction !== undefined && { buttonAction: dto.buttonAction }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.linkType !== undefined && { linkType: dto.linkType }),
        ...(dto.linkTarget !== undefined && { linkTarget: dto.linkTarget }),
        ...(dto.secondaryCtaLabel !== undefined && {
          secondaryCtaLabel: dto.secondaryCtaLabel,
        }),
        ...(dto.secondaryLinkUrl !== undefined && {
          secondaryLinkUrl: dto.secondaryLinkUrl,
        }),
        ...(dto.secondaryLinkType !== undefined && {
          secondaryLinkType: dto.secondaryLinkType,
        }),
        ...(dto.secondaryLinkTarget !== undefined && {
          secondaryLinkTarget: dto.secondaryLinkTarget,
        }),
        ...(dto.placement !== undefined && { placement: dto.placement as any }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        }),
      },
    });
    await this.cache.invalidateBanners();
    return banner;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    const banner = await this.prisma.banner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    const urls = [
      existing.imageUrl,
      existing.mobileUrl,
      existing.tabletUrl,
      existing.desktopUrl,
      existing.thumbnailUrl,
      existing.videoUrl,
    ];
    for (const url of urls) {
      const key = this.storage.extractStorageKey(url);
      if (!key) continue;
      try {
        await this.storage.deleteFile(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete R2 object for banner ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.cache.invalidateBanners();
    return banner;
  }

  async publish(id: string) {
    await this.findOne(id);
    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        status: EntityStatus.ACTIVE,
        isVisible: true,
        visibility: Visibility.PUBLIC,
      },
    });
    await this.cache.invalidateBanners();
    return banner;
  }

  async unpublish(id: string) {
    await this.findOne(id);
    const banner = await this.prisma.banner.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE, isVisible: false },
    });
    await this.cache.invalidateBanners();
    return banner;
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.banner.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateBanners();
    return { reordered: items.length };
  }
}
