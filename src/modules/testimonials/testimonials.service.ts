import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { normalizeMediaUrl } from '../../common/utils/media-url';
import { TestimonialResponseDto } from './dto/testimonials.dto';

@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findPublished(): Promise<TestimonialResponseDto[]> {
    const cached = await this.cache.get<TestimonialResponseDto[]>(
      CACHE_KEYS.TESTIMONIALS,
    );
    if (cached) return cached;

    const items = await this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const result = items.map((t) => this.mapTestimonial(t));
    await this.cache.set(CACHE_KEYS.TESTIMONIALS, result, CACHE_TTL.TESTIMONIALS);
    return result;
  }

  private mapTestimonial(item: {
    id: string;
    type: TestimonialResponseDto['type'];
    videoUrl: string | null;
    thumbnail: string | null;
    imageUrl: string | null;
    profileImage: string | null;
    customerName: string;
    designation: string | null;
    location: string | null;
    city: string | null;
    rating: number;
    review: string | null;
    sortOrder: number;
    featured: boolean;
  }): TestimonialResponseDto {
    return {
      id: item.id,
      type: item.type,
      videoUrl: normalizeMediaUrl(item.videoUrl),
      thumbnail: normalizeMediaUrl(item.thumbnail),
      imageUrl: normalizeMediaUrl(item.imageUrl),
      profileImage: normalizeMediaUrl(item.profileImage),
      customerName: item.customerName,
      designation: item.designation,
      location: item.location,
      city: item.city ?? item.location,
      rating: item.rating,
      review: item.review,
      sortOrder: item.sortOrder,
      featured: item.featured,
    };
  }
}
