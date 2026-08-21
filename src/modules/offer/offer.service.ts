import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { OfferResponseDto } from './dto/offer-response.dto';
import {
  CUSTOMER_OFFER_ORDER_BY,
  HOME_OFFERS_LIMIT,
  customerOfferWhere,
  isOfferProductAvailable,
  mapCtaAction,
  resolveStartingFrom,
} from './offer-eligibility.logic';

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  retailPrice: true,
  entityStatus: true,
  isVisible: true,
  deletedAt: true,
  category: { select: { name: true } },
  images: {
    where: { deletedAt: null, isPrimary: true },
    take: 1,
    select: { url: true },
  },
  variants: {
    where: { deletedAt: null },
    select: { inStock: true, deletedAt: true, price: true },
  },
} as const;

type OfferRow = {
  id: string;
  slug: string;
  title: string;
  titleHi: string | null;
  description: string | null;
  imageUrl: string | null;
  mobileImageUrl: string | null;
  offerType: string;
  discountLabel: string | null;
  discountValue: unknown;
  discountPercent: unknown;
  bundlePrice: unknown;
  originalPrice: unknown;
  badge: string | null;
  ctaLabel: string | null;
  ctaAction: string | null;
  ctaValue: string | null;
  priority: number;
  isFeatured: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  products?: Array<{
    quantity: number;
    product: {
      id: string;
      slug: string;
      name: string;
      brand: string | null;
      retailPrice: unknown;
      entityStatus: string;
      isVisible: boolean;
      deletedAt: Date | null;
      category: { name: string } | null;
      images: Array<{ url: string }>;
      variants: Array<{
        inStock: boolean;
        deletedAt: Date | null;
        price?: unknown;
      }>;
    };
  }>;
};

@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(options?: {
    featured?: boolean;
    limit?: number;
  }): Promise<OfferResponseDto[]> {
    const featured = options?.featured;
    const limit = options?.limit;
    const cacheKey =
      featured === true
        ? CACHE_KEYS.OFFERS_FEATURED
        : limit
          ? `${CACHE_KEYS.OFFERS}:limit:${limit}`
          : CACHE_KEYS.OFFERS;

    const cached = await this.cache.get<OfferResponseDto[]>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        ...customerOfferWhere(now),
        ...(featured ? { isFeatured: true } : {}),
      },
      orderBy: CUSTOMER_OFFER_ORDER_BY,
      ...(limit ? { take: limit } : {}),
      include: {
        products: {
          orderBy: { displayOrder: 'asc' },
          include: { product: { select: PRODUCT_SELECT } },
        },
      },
    });

    const result = offers.map((o) => this.mapOffer(o as OfferRow, false));
    await this.cache.set(cacheKey, result, CACHE_TTL.OFFERS);
    return result;
  }

  async findForHome(): Promise<OfferResponseDto[]> {
    return this.findAll({ limit: HOME_OFFERS_LIMIT });
  }

  async countActive(): Promise<number> {
    return this.prisma.offer.count({
      where: customerOfferWhere(new Date()),
    });
  }

  async findBySlug(slug: string): Promise<OfferResponseDto> {
    const cacheKey = CACHE_KEYS.OFFER(slug);
    const cached = await this.cache.get<OfferResponseDto>(cacheKey);
    if (cached) return cached;

    const offer = await this.prisma.offer.findFirst({
      where: {
        slug,
        ...customerOfferWhere(new Date()),
      },
      include: {
        products: {
          orderBy: { displayOrder: 'asc' },
          include: { product: { select: PRODUCT_SELECT } },
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
    offer: OfferRow,
    includeProducts: boolean,
  ): OfferResponseDto {
    const availableProducts = (offer.products ?? []).filter((op) =>
      isOfferProductAvailable(op.product),
    );
    const bundlePrice = offer.bundlePrice ? Number(offer.bundlePrice) : null;
    const startingFrom = resolveStartingFrom(
      bundlePrice,
      availableProducts.map((op) => op.product),
    );

    const dto: OfferResponseDto = {
      id: offer.id,
      slug: offer.slug,
      title: offer.title,
      titleHi: offer.titleHi,
      description: offer.description,
      bannerImage: offer.mobileImageUrl || offer.imageUrl,
      imageUrl: offer.imageUrl,
      mobileImageUrl: offer.mobileImageUrl,
      offerType: offer.offerType,
      discountLabel:
        offer.discountLabel ??
        (offer.discountPercent
          ? `${Number(offer.discountPercent)}% OFF`
          : offer.discountValue
            ? `₹${Number(offer.discountValue)} OFF`
            : null),
      discountValue: offer.discountValue ? Number(offer.discountValue) : null,
      discountPercent: offer.discountPercent
        ? Number(offer.discountPercent)
        : null,
      bundlePrice,
      originalPrice: offer.originalPrice ? Number(offer.originalPrice) : null,
      startingFrom,
      badge: offer.badge,
      ctaLabel: offer.ctaLabel ?? 'Shop Now',
      ctaAction: mapCtaAction(offer.ctaLabel, offer.ctaAction),
      ctaValue: offer.ctaValue,
      priority: offer.priority,
      isFeatured: offer.isFeatured,
      startDate: offer.startsAt,
      endDate: offer.endsAt,
      productCount: availableProducts.length,
      categories: [
        ...new Set(
          availableProducts
            .map((op) => op.product.category?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ],
    };

    if (includeProducts) {
      dto.products = (offer.products ?? [])
        .filter((op) => isOfferProductAvailable(op.product))
        .map((op) => ({
          id: op.product.id,
          slug: op.product.slug,
          name: op.product.name,
          quantity: op.quantity,
          imageUrl: op.product.images[0]?.url ?? null,
          retailPrice: Number(op.product.retailPrice),
          price: Number(op.product.retailPrice),
          available: true,
          categoryName: op.product.category?.name ?? null,
          brand: op.product.brand,
        }));
    }

    return dto;
  }
}
