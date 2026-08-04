import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class AdminCmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getHomeSequence() {
    const [sections, banners, offers, videos, ads, quickActions] =
      await Promise.all([
        this.prisma.homeSection.findMany({
          orderBy: { displayOrder: 'asc' },
        }),
        this.prisma.banner.count({ where: { deletedAt: null } }),
        this.prisma.offer.count({ where: { deletedAt: null } }),
        this.prisma.video.count({ where: { deletedAt: null } }),
        this.prisma.advertisement.count({ where: { deletedAt: null } }),
        this.prisma.quickAction.count({ where: { deletedAt: null } }),
      ]);

    return {
      sections,
      counts: {
        banners,
        offers,
        videos,
        ads,
        quickActions,
      },
    };
  }

  async reorderHomeSequence(
    items: Array<{ id: string; displayOrder: number }>,
  ) {
    await Promise.all(
      items.map((item) =>
        this.prisma.homeSection.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }

  async getEmergencyBanners() {
    return this.prisma.promotionalCard.findMany({
      where: {
        cardType: { in: ['EMERGENCY_DELIVERY', 'EMERGENCY_BANNER'] },
        deletedAt: null,
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getMembershipBanners() {
    return this.prisma.promotionalCard.findMany({
      where: { cardType: 'MEMBERSHIP', deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getBulkProcurementSection() {
    return this.prisma.promotionalCard.findMany({
      where: { cardType: 'BULK_PROCUREMENT', deletedAt: null },
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
    return this.prisma.promotionalCard.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });
  }
}
