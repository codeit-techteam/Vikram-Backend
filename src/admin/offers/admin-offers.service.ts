import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EntityStatus,
  OfferTargetAudience,
  OfferType,
  Visibility,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateOfferDto,
  UpdateOfferDto,
  OfferQueryDto,
} from './dto/admin-offers.dto';
import {
  mapCtaAction,
  parseOfferEndAt,
  parseOfferStartAt,
  resolveLifecycleStatus,
  schedulesOverlap,
} from '../../modules/offer/offer-eligibility.logic';

@Injectable()
export class AdminOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: OfferQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status && ['ACTIVE', 'INACTIVE', 'DRAFT'].includes(query.status)) {
      where['status'] = query.status;
    }
    if (query.search) {
      where['OR'] = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.isFeatured !== undefined) where['isFeatured'] = query.isFeatured;
    if (query.placement === 'featured') where['isFeatured'] = true;
    if (query.placement === 'home-carousel') where['isFeatured'] = false;

    const [rows, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        include: {
          products: {
            orderBy: { displayOrder: 'asc' },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  sku: true,
                  brand: true,
                  retailPrice: true,
                  category: { select: { name: true } },
                  images: {
                    where: { deletedAt: null },
                    orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    const now = new Date();
    const data = rows.map((row) => ({
      ...row,
      lifecycleStatus: resolveLifecycleStatus(row, now),
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id, deletedAt: null },
      include: {
        products: {
          orderBy: { displayOrder: 'asc' },
          include: { product: true },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return {
      ...offer,
      lifecycleStatus: resolveLifecycleStatus(offer),
    };
  }

  async findDuplicateWarning(input: {
    title: string;
    isFeatured?: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    excludeId?: string;
  }) {
    const candidates = await this.prisma.offer.findMany({
      where: {
        deletedAt: null,
        title: { equals: input.title, mode: 'insensitive' },
        isFeatured: input.isFeatured ?? false,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        isFeatured: true,
      },
    });

    return candidates.filter((row) =>
      schedulesOverlap(
        input.startsAt ?? null,
        input.endsAt ?? null,
        row.startsAt,
        row.endsAt,
      ),
    );
  }

  async create(dto: CreateOfferDto) {
    const startsAt = dto.startsAt ? parseOfferStartAt(dto.startsAt) : undefined;
    const endsAt = dto.endsAt ? parseOfferEndAt(dto.endsAt) : undefined;
    const duplicates = await this.findDuplicateWarning({
      title: dto.title,
      isFeatured: dto.isFeatured ?? false,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
    });

    const offer = await this.prisma.offer.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        mobileImageUrl: dto.mobileImageUrl,
        offerType: (dto.offerType as OfferType) ?? OfferType.BUNDLE,
        discountValue: dto.discountValue,
        discountPercent: dto.discountPercent,
        discountLabel: dto.discountLabel,
        bundlePrice: dto.bundlePrice,
        originalPrice: dto.originalPrice,
        badge: dto.badge,
        ctaLabel: dto.ctaLabel ?? 'Shop Now',
        ctaAction: mapCtaAction(dto.ctaLabel, dto.ctaAction),
        ctaValue: dto.ctaValue,
        targetAudience: dto.targetAudience ?? OfferTargetAudience.ALL,
        isFeatured: dto.isFeatured ?? false,
        displayOrder: dto.displayOrder ?? dto.priority ?? 0,
        priority: dto.priority ?? 0,
        startsAt,
        endsAt,
        status: EntityStatus.DRAFT,
        isVisible: false,
        visibility: Visibility.HIDDEN,
      },
    });
    await this.cache.invalidateOffers();
    return {
      ...offer,
      lifecycleStatus: resolveLifecycleStatus(offer),
      duplicateWarning: duplicates.length > 0,
      duplicates,
    };
  }

  async update(id: string, dto: UpdateOfferDto) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.mobileImageUrl !== undefined && {
          mobileImageUrl: dto.mobileImageUrl,
        }),
        ...(dto.offerType !== undefined && {
          offerType: dto.offerType as OfferType,
        }),
        ...(dto.discountValue !== undefined && {
          discountValue: dto.discountValue,
        }),
        ...(dto.discountPercent !== undefined && {
          discountPercent: dto.discountPercent,
        }),
        ...(dto.discountLabel !== undefined && {
          discountLabel: dto.discountLabel,
        }),
        ...(dto.bundlePrice !== undefined && { bundlePrice: dto.bundlePrice }),
        ...(dto.originalPrice !== undefined && {
          originalPrice: dto.originalPrice,
        }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.ctaAction !== undefined || dto.ctaLabel !== undefined
          ? { ctaAction: mapCtaAction(dto.ctaLabel, dto.ctaAction) }
          : {}),
        ...(dto.ctaValue !== undefined && { ctaValue: dto.ctaValue }),
        ...(dto.targetAudience !== undefined && {
          targetAudience: dto.targetAudience,
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.priority !== undefined && {
          priority: dto.priority,
          displayOrder: dto.displayOrder ?? dto.priority,
        }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? parseOfferStartAt(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? parseOfferEndAt(dto.endsAt) : null,
        }),
      },
    });
    await this.cache.invalidateOffers();
    return {
      ...offer,
      lifecycleStatus: resolveLifecycleStatus(offer),
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: { deletedAt: new Date(), isVisible: false },
    });
    await this.cache.invalidateOffers();
    return offer;
  }

  async activate(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        status: EntityStatus.ACTIVE,
        isVisible: true,
        visibility: Visibility.PUBLIC,
      },
    });
    await this.cache.invalidateOffers();
    return {
      ...offer,
      lifecycleStatus: resolveLifecycleStatus(offer),
    };
  }

  async deactivate(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        status: EntityStatus.INACTIVE,
        isVisible: false,
        visibility: Visibility.HIDDEN,
      },
    });
    await this.cache.invalidateOffers();
    return {
      ...offer,
      lifecycleStatus: resolveLifecycleStatus(offer),
    };
  }

  async publish(id: string) {
    return this.activate(id);
  }

  async setProducts(offerId: string, productIds: string[]) {
    await this.findOne(offerId);
    await this.prisma.offerProduct.deleteMany({ where: { offerId } });
    if (productIds.length) {
      await this.prisma.offerProduct.createMany({
        data: productIds.map((productId, index) => ({
          offerId,
          productId,
          displayOrder: index,
        })),
      });
    }
    await this.cache.invalidateOffers();
    return this.findOne(offerId);
  }
}
