import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { VISIBLE_WHERE } from '../../common/utils/prisma.util';
import { OfferResponseDto } from './dto/offer-response.dto';

@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(featured?: boolean): Promise<OfferResponseDto[]> {
    const cacheKey = featured
      ? CACHE_KEYS.OFFERS_FEATURED
      : CACHE_KEYS.OFFERS;

    const cached = await this.cache.get<OfferResponseDto[]>(cacheKey);
    if (cached) return cached;

    const now = new Date();

    const offers = await this.prisma.offer.findMany({
      where: {
        ...VISIBLE_WHERE,
        ...(featured ? { isFeatured: true } : {}),
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { displayOrder: 'asc' }],
      include: {
        products: {
          orderBy: { displayOrder: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                retailPrice: true,
                images: {
                  where: { deletedAt: null, isPrimary: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const result = offers.map((o) => this.mapOffer(o, false));
    await this.cache.set(cacheKey, result, CACHE_TTL.OFFERS);
    return result;
  }

  async countActive(): Promise<number> {
    const now = new Date();
    return this.prisma.offer.count({
      where: {
        ...VISIBLE_WHERE,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
    });
  }

  async findBySlug(slug: string): Promise<OfferResponseDto> {
    const cacheKey = CACHE_KEYS.OFFER(slug);
    const cached = await this.cache.get<OfferResponseDto>(cacheKey);
    if (cached) return cached;

    const now = new Date();

    const offer = await this.prisma.offer.findFirst({
      where: {
        slug,
        ...VISIBLE_WHERE,
        OR: [
          { startsAt: null, endsAt: null },
          { startsAt: { lte: now }, endsAt: null },
          { startsAt: null, endsAt: { gte: now } },
          { startsAt: { lte: now }, endsAt: { gte: now } },
        ],
      },
      include: {
        products: {
          orderBy: { displayOrder: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                retailPrice: true,
                images: {
                  where: { deletedAt: null, isPrimary: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException(`Offer "${slug}" not found`);
    }

    const result = this.mapOffer(offer, true);
    await this.cache.set(cacheKey, result, CACHE_TTL.OFFERS);
    return result;
  }

  private mapOffer(
    offer: {
      id: string;
      slug: string;
      title: string;
      titleHi: string | null;
      description: string | null;
      imageUrl: string | null;
      offerType: string;
      discountLabel: string | null;
      discountValue: unknown;
      discountPercent: unknown;
      bundlePrice: unknown;
      originalPrice: unknown;
      badge: string | null;
      priority: number;
      isFeatured: boolean;
      isVisible: boolean;
      visibility: string;
      startsAt: Date | null;
      endsAt: Date | null;
      products?: Array<{
        quantity: number;
        product: {
          id: string;
          slug: string;
          name: string;
          retailPrice: unknown;
          images: Array<{ url: string }>;
        };
      }>;
    },
    includeProducts: boolean,
  ): OfferResponseDto {
    const dto: OfferResponseDto = {
      id: offer.id,
      slug: offer.slug,
      title: offer.title,
      titleHi: offer.titleHi,
      description: offer.description,
      bannerImage: offer.imageUrl,
      imageUrl: offer.imageUrl,
      offerType: offer.offerType,
      discountLabel:
        offer.discountLabel ??
        (offer.discountPercent
          ? `${Number(offer.discountPercent)}% OFF`
          : offer.discountValue
            ? `₹${Number(offer.discountValue)} OFF`
            : null),
      discountValue: offer.discountValue
        ? Number(offer.discountValue)
        : null,
      discountPercent: offer.discountPercent
        ? Number(offer.discountPercent)
        : null,
      bundlePrice: offer.bundlePrice ? Number(offer.bundlePrice) : null,
      originalPrice: offer.originalPrice ? Number(offer.originalPrice) : null,
      badge: offer.badge,
      priority: offer.priority,
      visibility: offer.visibility,
      isFeatured: offer.isFeatured,
      isVisible: offer.isVisible,
      startDate: offer.startsAt,
      endDate: offer.endsAt,
    };

    if (includeProducts && offer.products) {
      dto.products = offer.products.map((op) => ({
        id: op.product.id,
        slug: op.product.slug,
        name: op.product.name,
        quantity: op.quantity,
        imageUrl: op.product.images[0]?.url ?? null,
        retailPrice: Number(op.product.retailPrice),
        price: Number(op.product.retailPrice),
      }));
    }

    return dto;
  }
}
