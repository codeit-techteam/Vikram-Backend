import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { PRODUCT_ACTIVE_WHERE } from '../../common/utils/prisma.util';
import { decimalToNumber } from '../../common/shopping/pricing.util';
import {
  AddWishlistDto,
  WishlistItemDto,
  WishlistResponseDto,
} from './dto/wishlist.dto';

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getWishlist(customerId: string): Promise<WishlistResponseDto> {
    const cacheKey = CACHE_KEYS.WISHLIST(customerId);
    const cached = await this.cache.get<WishlistResponseDto>(cacheKey);
    if (cached) return cached;

    const wishlist = await this.ensureWishlist(customerId);
    const data = await this.buildWishlistResponse(wishlist.id);
    await this.cache.set(cacheKey, data, CACHE_TTL.WISHLIST);
    return data;
  }

  async addItem(
    customerId: string,
    dto: AddWishlistDto,
  ): Promise<WishlistResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const wishlist = await this.ensureWishlist(customerId);

    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId: dto.productId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Product already exists in wishlist');
    }

    await this.prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId: dto.productId,
      },
    });

    await this.cache.invalidateWishlist(customerId);
    return this.getWishlist(customerId);
  }

  async removeItem(
    customerId: string,
    productId: string,
  ): Promise<WishlistResponseDto> {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { customerId },
    });

    if (!wishlist) {
      throw new NotFoundException('Wishlist is empty');
    }

    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Product not found in wishlist');
    }

    await this.prisma.wishlistItem.delete({ where: { id: item.id } });
    await this.cache.invalidateWishlist(customerId);
    return this.getWishlist(customerId);
  }

  private async ensureWishlist(customerId: string) {
    return this.prisma.wishlist.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  private async buildWishlistResponse(
    wishlistId: string,
  ): Promise<WishlistResponseDto> {
    const wishlist = await this.prisma.wishlist.findUniqueOrThrow({
      where: { id: wishlistId },
      include: {
        items: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: {
              include: {
                images: {
                  where: { deletedAt: null },
                  orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const items: WishlistItemDto[] = wishlist.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      createdAt: item.createdAt.toISOString(),
      product: {
        id: item.product.id,
        slug: item.product.slug,
        name: item.product.name,
        brand: item.product.brand,
        unit: item.product.unit,
        price: decimalToNumber(item.product.retailPrice),
        gst: decimalToNumber(item.product.gst),
        thumbnailUrl: item.product.images[0]?.url ?? null,
        isVisible:
          item.product.isVisible &&
          item.product.entityStatus === 'ACTIVE' &&
          !item.product.deletedAt,
        status: item.product.status,
      },
    }));

    return {
      id: wishlist.id,
      items,
      count: items.length,
    };
  }

  /** Validates product is purchasable (active + visible). Used by cart. */
  async assertProductPurchasable(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...PRODUCT_ACTIVE_WHERE },
    });
    if (!product) {
      throw new BadRequestException(
        'Product is not available (hidden or inactive)',
      );
    }
    return product;
  }
}
