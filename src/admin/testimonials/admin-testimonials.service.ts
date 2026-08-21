import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_PATTERNS } from '../../common/cache/cache.constants';
import {
  isAbsoluteMediaUrl,
  isLegacyAssetPath,
  normalizeMediaUrl,
} from '../../common/utils/media-url';
import { R2StorageService } from '../../storage/r2.service';
import type {
  CreateTestimonialDto,
  UpdateTestimonialDto,
  TestimonialQueryDto,
} from './dto/admin-testimonials.dto';

type TestimonialRow = Prisma.TestimonialGetPayload<object>;

export type AdminTestimonialView = TestimonialRow & {
  /** Normalized absolute URLs for Admin UI (legacy paths become null). */
  videoUrl: string | null;
  thumbnail: string | null;
  imageUrl: string | null;
  profileImage: string | null;
  mediaUnavailable: boolean;
};

@Injectable()
export class AdminTestimonialsService {
  private readonly logger = new Logger(AdminTestimonialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  async findAll(query: TestimonialQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.testimonial.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.testimonial.count({ where }),
    ]);

    return {
      data: data.map((row) => this.mapForAdmin(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findOne(id: string) {
    const testimonial = await this.prisma.testimonial.findUnique({
      where: { id },
    });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    return this.mapForAdmin(testimonial);
  }

  async create(dto: CreateTestimonialDto) {
    const row = await this.prisma.testimonial.create({
      data: {
        type: dto.type as any,
        customerName: dto.customerName,
        designation: dto.designation,
        company: dto.company,
        location: dto.location,
        city: dto.city,
        videoUrl: dto.videoUrl,
        thumbnail: dto.thumbnail?.trim() || null,
        imageUrl: dto.imageUrl,
        profileImage: dto.profileImage,
        review: dto.review,
        rating: dto.rating ?? 5,
        sortOrder: dto.sortOrder ?? 0,
        featured: dto.featured ?? false,
        isPublished: dto.publish === true,
      },
    });
    await this.invalidateTestimonialCaches();
    return this.mapForAdmin(row);
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    const existing = await this.prisma.testimonial.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Testimonial not found');

    const data: Prisma.TestimonialUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type as any;
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.designation !== undefined) data.designation = dto.designation;
    if (dto.company !== undefined) data.company = dto.company;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl;
    if (dto.thumbnail !== undefined)
      data.thumbnail = dto.thumbnail?.trim() || null;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.profileImage !== undefined) data.profileImage = dto.profileImage;
    if (dto.review !== undefined) data.review = dto.review;
    if (dto.rating !== undefined) data.rating = dto.rating;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.featured !== undefined) data.featured = dto.featured;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;

    const row = await this.prisma.testimonial.update({
      where: { id },
      data,
    });

    // Best-effort cleanup of replaced R2 objects (same policy as banners).
    await this.deleteReplacedMedia(existing, dto);

    await this.invalidateTestimonialCaches();
    return this.mapForAdmin(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.testimonial.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Testimonial not found');

    const row = await this.prisma.testimonial.delete({ where: { id } });

    await this.deleteMediaUrls([
      existing.videoUrl,
      existing.thumbnail,
      existing.imageUrl,
      existing.profileImage,
    ]);

    await this.invalidateTestimonialCaches();
    return this.mapForAdmin(row);
  }

  async publish(id: string) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.update({
      where: { id },
      data: { isPublished: true },
    });
    await this.invalidateTestimonialCaches();
    return this.mapForAdmin(row);
  }

  async unpublish(id: string) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.update({
      where: { id },
      data: { isPublished: false },
    });
    await this.invalidateTestimonialCaches();
    return this.mapForAdmin(row);
  }

  async reorder(items: Array<{ id: string; sortOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.testimonial.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    await this.invalidateTestimonialCaches();
    return { reordered: items.length };
  }

  async getPublished() {
    const rows = await this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.mapForAdmin(row));
  }

  private buildWhere(query: TestimonialQueryDto): Prisma.TestimonialWhereInput {
    const where: Prisma.TestimonialWhereInput = {};

    if (query.type) where.type = query.type as any;

    const published = this.resolvePublishedFilter(query);
    if (published !== undefined) where.isPublished = published;

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { review: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private resolvePublishedFilter(
    query: TestimonialQueryDto,
  ): boolean | undefined {
    if (typeof query.isPublished === 'boolean') return query.isPublished;

    const status = query.status?.trim().toLowerCase();
    if (!status || status === 'all') return undefined;
    if (status === 'published' || status === 'true') return true;
    if (status === 'draft' || status === 'unpublished' || status === 'false') {
      return false;
    }
    return undefined;
  }

  private mapForAdmin(row: TestimonialRow): AdminTestimonialView {
    const videoUrl = this.readableMedia(row.videoUrl);
    const thumbnail = this.readableMedia(row.thumbnail);
    const imageUrl = this.readableMedia(row.imageUrl);
    const profileImage = this.readableMedia(row.profileImage);

    if (
      (row.videoUrl && !videoUrl) ||
      (row.thumbnail && !thumbnail) ||
      (row.imageUrl && !imageUrl)
    ) {
      this.logger.warn(
        `Testimonial ${row.id} (${row.customerName}) has unavailable media refs: video=${row.videoUrl ?? 'n/a'} thumbnail=${row.thumbnail ?? 'n/a'} image=${row.imageUrl ?? 'n/a'}`,
      );
    }

    const mediaUnavailable = this.isMediaUnavailable(row.type, {
      videoUrl,
      thumbnail,
      imageUrl,
    });

    return {
      ...row,
      videoUrl,
      thumbnail,
      imageUrl,
      profileImage,
      mediaUnavailable,
    };
  }

  private readableMedia(url?: string | null): string | null {
    if (!url?.trim()) return null;
    if (isLegacyAssetPath(url)) return null;
    if (
      url.includes('commondatastorage.googleapis.com') ||
      url.includes('gtv-videos-bucket')
    ) {
      return null;
    }
    if (isAbsoluteMediaUrl(url)) return url.trim();
    // Bare R2 object key → public CDN URL via existing R2 config
    if (!url.includes('://') && !url.startsWith('/')) {
      try {
        return this.storage.getPublicUrl(url.trim());
      } catch {
        return null;
      }
    }
    return normalizeMediaUrl(url);
  }

  private isMediaUnavailable(
    type: string,
    media: {
      videoUrl: string | null;
      thumbnail: string | null;
      imageUrl: string | null;
    },
  ): boolean {
    if (type === 'VIDEO') return !media.videoUrl;
    if (type === 'IMAGE') return !media.imageUrl;
    return false;
  }

  private async deleteReplacedMedia(
    existing: TestimonialRow,
    dto: UpdateTestimonialDto,
  ) {
    const replacements: Array<[string | null | undefined, string | undefined]> =
      [
        [existing.videoUrl, dto.videoUrl],
        [existing.thumbnail, dto.thumbnail],
        [existing.imageUrl, dto.imageUrl],
        [existing.profileImage, dto.profileImage],
      ];

    for (const [previous, next] of replacements) {
      if (next === undefined || !previous || previous === next) continue;
      await this.deleteMediaUrls([previous]);
    }
  }

  private async deleteMediaUrls(urls: Array<string | null | undefined>) {
    for (const url of urls) {
      const key = this.storage.extractStorageKey(url);
      if (!key) continue;
      try {
        await this.storage.deleteFile(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete R2 object ${key}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async invalidateTestimonialCaches() {
    await this.cache.invalidateCms();
    await this.cache.del(CACHE_KEYS.TESTIMONIALS);
    await this.cache.invalidatePattern(CACHE_PATTERNS.TESTIMONIALS);
  }
}
