import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateTestimonialDto, UpdateTestimonialDto, TestimonialQueryDto } from './dto/admin-testimonials.dto';

@Injectable()
export class AdminTestimonialsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const testimonial = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    return testimonial;
  }

  async create(dto: CreateTestimonialDto) {
    return this.prisma.testimonial.create({
      data: {
        type: (dto.type as any),
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
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    await this.findOne(id);
    return this.prisma.testimonial.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.testimonial.delete({ where: { id } });
  }

  async publish(id: string) {
    await this.findOne(id);
    return this.prisma.testimonial.update({ where: { id }, data: { isPublished: true } });
  }

  async unpublish(id: string) {
    await this.findOne(id);
    return this.prisma.testimonial.update({ where: { id }, data: { isPublished: false } });
  }

  async reorder(items: Array<{ id: string; sortOrder: number }>) {
    await Promise.all(
      items.map((item) => this.prisma.testimonial.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
    );
    return { reordered: items.length };
  }

  // Customer App Home API: published testimonials consumed automatically
  async getPublished() {
    return this.prisma.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
