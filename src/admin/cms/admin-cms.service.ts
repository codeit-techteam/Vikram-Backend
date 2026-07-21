import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

export interface HomeSectionItem {
  section: string;
  displayOrder: number;
  isVisible: boolean;
  config?: Record<string, unknown>;
}

@Injectable()
export class AdminCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeSequence() {
    // Returns the current home page section ordering and visibility
    const [banners, offers, videos, testimonials, categories, products] = await Promise.all([
      this.prisma.banner.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, title: true, placement: true, displayOrder: true, isVisible: true },
        orderBy: { displayOrder: 'asc' },
      }),
      this.prisma.offer.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, title: true, displayOrder: true, isVisible: true, isFeatured: true },
        orderBy: { displayOrder: 'asc' },
      }),
      this.prisma.video.findMany({
        where: { status: 'ACTIVE', placement: 'HOME', deletedAt: null },
        select: { id: true, title: true, displayOrder: true, isVisible: true },
        orderBy: { displayOrder: 'asc' },
      }),
      this.prisma.testimonial.findMany({
        where: { isPublished: true },
        select: { id: true, customerName: true, type: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { status: 'ACTIVE', isVisible: true, deletedAt: null },
        select: { id: true, name: true, displayOrder: true, isFeatured: true },
        orderBy: { displayOrder: 'asc' },
        take: 20,
      }),
      this.prisma.product.findMany({
        where: { entityStatus: 'ACTIVE', isFeatured: true, deletedAt: null },
        select: { id: true, name: true, displayOrder: true, listingType: true },
        orderBy: { displayOrder: 'asc' },
        take: 20,
      }),
    ]);

    return {
      sections: {
        banners: { items: banners, count: banners.length },
        offers: { items: offers, count: offers.length },
        videos: { items: videos, count: videos.length },
        testimonials: { items: testimonials, count: testimonials.length },
        categories: { items: categories, count: categories.length },
        featuredProducts: { items: products, count: products.length },
      },
    };
  }

  async getEmergencyBanners() {
    return this.prisma.banner.findMany({
      where: { placement: 'EMERGENCY_DELIVERY', status: 'ACTIVE', deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getMembershipBanners() {
    return this.prisma.banner.findMany({
      where: { placement: 'HOME_PROMO', status: 'ACTIVE', deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getBulkProcurementSection() {
    return this.prisma.banner.findMany({
      where: { placement: 'BULK_PROCUREMENT', status: 'ACTIVE', deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getRecommendedProducts() {
    return this.prisma.product.findMany({
      where: { entityStatus: 'ACTIVE', isFeatured: true, deletedAt: null },
      include: { images: { where: { isPrimary: true }, take: 1 } },
      orderBy: { displayOrder: 'asc' },
      take: 20,
    });
  }

  async getPromotionalCards() {
    return this.prisma.offer.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
    });
  }
}
