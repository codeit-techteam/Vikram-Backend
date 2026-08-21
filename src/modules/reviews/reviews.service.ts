import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { decimalToNumber } from '../orders/orders.constants';
import {
  CreateReviewDto,
  ProductReviewsResponseDto,
  ReviewResponseDto,
  UpdateReviewDto,
} from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(
    customerId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        customerId,
        deletedAt: null,
        orderStatus: OrderStatus.DELIVERED,
      },
      include: {
        items: {
          where: { productId: dto.productId },
          select: { id: true },
        },
      },
    });

    if (!order) {
      throw new BadRequestException(
        'Reviews can only be submitted for delivered orders you own.',
      );
    }

    if (order.items.length === 0) {
      throw new BadRequestException('Product was not part of this order.');
    }

    const existing = await this.prisma.review.findFirst({
      where: {
        orderId: dto.orderId,
        productId: dto.productId,
        customerId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'You have already reviewed this product for this order.',
      );
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          orderId: dto.orderId,
          productId: dto.productId,
          customerId,
          rating: dto.rating,
          title: dto.title,
          comment: dto.comment,
          images: dto.images ?? Prisma.JsonNull,
        },
        include: {
          customer: { select: { fullName: true } },
        },
      });

      await this.recalculateProductRating(tx, dto.productId);
      return created;
    });

    await this.cache.invalidateReviews(dto.productId);
    await this.cache.invalidateProducts();

    return this.mapReview(review);
  }

  async findByProduct(productId: string): Promise<ProductReviewsResponseDto> {
    const cacheKey = CACHE_KEYS.PRODUCT_REVIEWS(productId);
    const cached = await this.cache.get<ProductReviewsResponseDto>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, averageRating: true, reviewCount: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const reviews = await this.prisma.review.findMany({
      where: { productId, isVisible: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { fullName: true } },
      },
    });

    const result: ProductReviewsResponseDto = {
      productId: product.id,
      averageRating: decimalToNumber(product.averageRating),
      reviewCount: product.reviewCount,
      items: reviews.map((r) => this.mapReview(r)),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.REVIEWS);
    return result;
  }

  async update(
    customerId: string,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, deletedAt: null },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.customerId !== customerId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: {
          rating: dto.rating,
          title: dto.title,
          comment: dto.comment,
          ...(dto.images !== undefined
            ? { images: dto.images ?? Prisma.JsonNull }
            : {}),
        },
        include: {
          customer: { select: { fullName: true } },
        },
      });

      if (dto.rating !== undefined) {
        await this.recalculateProductRating(tx, review.productId);
      }

      return result;
    });

    await this.cache.invalidateReviews(review.productId);
    await this.cache.invalidateProducts();

    return this.mapReview(updated);
  }

  async remove(customerId: string, reviewId: string): Promise<void> {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, deletedAt: null },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.customerId !== customerId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: reviewId },
        data: { deletedAt: new Date(), isVisible: false },
      });
      await this.recalculateProductRating(tx, review.productId);
    });

    await this.cache.invalidateReviews(review.productId);
    await this.cache.invalidateProducts();
  }

  private async recalculateProductRating(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId, deletedAt: null, isVisible: true },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        averageRating: agg._avg.rating ?? 0,
        reviewCount: agg._count._all,
      },
    });
  }

  private mapReview(review: {
    id: string;
    productId: string;
    orderId: string;
    customerId: string;
    rating: number;
    title: string | null;
    comment: string | null;
    images: unknown;
    createdAt: Date;
    updatedAt: Date;
    customer?: { fullName: string | null };
  }): ReviewResponseDto {
    return {
      id: review.id,
      productId: review.productId,
      orderId: review.orderId,
      customerId: review.customerId,
      customerName: review.customer?.fullName ?? null,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      images: Array.isArray(review.images) ? (review.images as string[]) : null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }
}
