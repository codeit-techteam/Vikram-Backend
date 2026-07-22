import { Injectable } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { BannerService } from '../banner/banner.service';
import { CategoryService } from '../category/category.service';
import { OfferService } from '../offer/offer.service';
import { ProductService } from '../product/product.service';
import { VideoService } from '../video/video.service';
import { MembershipService } from '../membership/membership.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { TestimonialsService } from '../testimonials/testimonials.service';
import { OrdersService } from '../orders/orders.service';
import { HomeResponseDto } from './dto/home-response.dto';

type PublicHomeData = Omit<
  HomeResponseDto,
  'membership' | 'loyalty' | 'lastOrders'
>;

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly bannerService: BannerService,
    private readonly offerService: OfferService,
    private readonly categoryService: CategoryService,
    private readonly productService: ProductService,
    private readonly videoService: VideoService,
    private readonly membershipService: MembershipService,
    private readonly loyaltyService: LoyaltyService,
    private readonly testimonialsService: TestimonialsService,
    private readonly ordersService: OrdersService,
  ) {}

  async getHomeData(customerId?: string): Promise<HomeResponseDto> {
    const publicData = await this.getPublicHomeData();

    if (!customerId) {
      return {
        ...publicData,
        membership: null,
        loyalty: null,
        lastOrders: [],
      };
    }

    const [membership, loyalty, lastOrders] = await Promise.all([
      this.membershipService.getCurrentMembership(customerId),
      this.loyaltyService.getLoyaltySummary(customerId),
      this.ordersService.getRecentOrders(customerId, 3),
    ]);

    return {
      ...publicData,
      membership,
      loyalty,
      lastOrders,
    };
  }

  private async getPublicHomeData(): Promise<PublicHomeData> {
    const cached = await this.cache.get<PublicHomeData>(CACHE_KEYS.HOME);
    if (cached) return cached;

    const [
      banners,
      featuredOffers,
      featuredCategories,
      topCategories,
      featuredProducts,
      bestSellingProducts,
      recommendedProducts,
      videos,
      announcements,
      activeOffersCount,
      featuredProductsCount,
      testimonials,
      bulkBanner,
      emergencyBanner,
    ] = await Promise.all([
      this.bannerService.findAll('HOME_HERO'),
      this.offerService.findAll(true),
      this.categoryService.findAll(true),
      this.categoryService.findTop(12),
      this.productService.findFeatured(8),
      this.productService.findBestSelling(8),
      this.productService.findRecommended(8),
      this.videoService.findAll('HOME'),
      this.getAnnouncements(),
      this.offerService.countActive(),
      this.productService.countFeatured(),
      this.testimonialsService.findPublished(),
      this.bannerService.findAll('BULK_PROCUREMENT'),
      this.bannerService.findAll('EMERGENCY_DELIVERY'),
    ]);

    const result: PublicHomeData = {
      banners,
      featuredOffers,
      featuredCategories,
      topCategories,
      featuredProducts,
      bestSellingProducts,
      recommendedProducts,
      videos,
      announcements,
      quickStats: {
        activeOffers: activeOffersCount,
        featuredProducts: featuredProductsCount,
      },
      testimonials,
      bulkBanner,
      emergencyBanner,
    };

    await this.cache.set(CACHE_KEYS.HOME, result, CACHE_TTL.HOME);
    return result;
  }

  private async getAnnouncements() {
    const now = new Date();

    const items = await this.prisma.announcement.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        status: EntityStatus.ACTIVE,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }],
      take: 5,
    });

    return items.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      linkUrl: a.linkUrl,
      linkTarget: a.linkTarget,
    }));
  }
}
