import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateTestimonialDto,
  UpdateTestimonialDto,
  TestimonialQueryDto,
} from './dto/admin-testimonials.dto';

@Injectable()
export class AdminTestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: TestimonialQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (query.type) where['type'] = query.type;

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
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const testimonial = await this.prisma.testimonial.findUnique({
      where: { id },
    });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    return testimonial;
  }

  async create(dto: CreateTestimonialDto) {
    const row = await this.prisma.testimonial.create({
      data: {
        type: dto.type as any,
        customerName: dto.customerName,
        designation: dto.designation,
        location: dto.location,
        videoUrl: dto.videoUrl,
        thumbnail: dto.thumbnail,
        imageUrl: dto.imageUrl,
        review: dto.review,
        rating: dto.rating ?? 5,
        sortOrder: dto.sortOrder ?? 0,
        isPublished: false,
      },
    });
    await this.cache.invalidateCms();
    return row;
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.update({
      where: { id },
      data: dto,
    });
    await this.cache.invalidateCms();
    return row;
  }

  async remove(id: string) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.delete({ where: { id } });
    await this.cache.invalidateCms();
    return row;
  }

  async publish(id: string) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.update({
      where: { id },
      data: { isPublished: true },
    });
    await this.cache.invalidateCms();
    return row;
  }

  async unpublish(id: string) {
    await this.findOne(id);
    const row = await this.prisma.testimonial.update({
      where: { id },
      data: { isPublished: false },
    });
    await this.cache.invalidateCms();
    return row;
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
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }

  async getPublished() {
    return this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
