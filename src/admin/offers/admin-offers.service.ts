import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Visibility } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateOfferDto,
  UpdateOfferDto,
  OfferQueryDto,
} from './dto/admin-offers.dto';

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
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['OR'] = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          products: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id, deletedAt: null },
      include: { products: { include: { product: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  async create(dto: CreateOfferDto) {
    const offer = await this.prisma.offer.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        offerType: dto.offerType as any,
        discountValue: dto.discountValue,
        discountPercent: dto.discountPercent,
        discountLabel: dto.discountLabel,
        bundlePrice: dto.bundlePrice,
        originalPrice: dto.originalPrice,
        badge: dto.badge,
        isFeatured: dto.isFeatured ?? false,
        displayOrder: dto.displayOrder ?? 0,
        priority: dto.priority ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: 'DRAFT',
        isVisible: false,
      },
    });
    await this.cache.invalidateOffers();
    return offer;
  }

  async update(id: string, dto: UpdateOfferDto) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.discountValue !== undefined && {
          discountValue: dto.discountValue,
        }),
        ...(dto.discountPercent !== undefined && {
          discountPercent: dto.discountPercent,
        }),
        ...(dto.discountLabel !== undefined && {
          discountLabel: dto.discountLabel,
        }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        }),
      },
    });
    await this.cache.invalidateOffers();
    return offer;
  }

  async remove(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: { deletedAt: new Date() },
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
    return offer;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: { status: EntityStatus.INACTIVE, isVisible: false },
    });
    await this.cache.invalidateOffers();
    return offer;
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
