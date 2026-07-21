import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  buildPaginationMeta,
  SortOrder,
} from '../../common/dto/pagination.dto';
import { hashQueryParams, PRODUCT_ACTIVE_WHERE } from '../../common/utils/prisma.util';
import { ProductQueryDto } from './dto/product-query.dto';
import {
  ProductListResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';

const PRODUCT_LIST_INCLUDE = {
  category: { select: { id: true, slug: true, name: true } },
  images: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }],
    take: 1,
  },
} satisfies Prisma.ProductInclude;

const PRODUCT_DETAIL_INCLUDE = {
  category: { select: { id: true, slug: true, name: true } },
  images: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }],
  },
  variants: {
    where: { deletedAt: null },
    orderBy: { displayOrder: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: ProductQueryDto): Promise<ProductListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isDefaultList = this.isDefaultProductListQuery(query, page, limit);
    const cacheKey = isDefaultList
      ? CACHE_KEYS.PRODUCTS_PAGE(page)
      : CACHE_KEYS.PRODUCTS(hashQueryParams({ ...query, page, limit }));

    const cached = await this.cache.get<ProductListResponseDto>(cacheKey);
    if (cached) return cached;

    const where = this.buildWhereClause(query);
    const orderBy = this.buildOrderBy(query);

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: PRODUCT_LIST_INCLUDE,
      }),
    ]);

    const stockMap = await this.getStockMap(products.map((p) => p.id));

    const result: ProductListResponseDto = {
      items: products.map((p) => this.mapProduct(p, false, stockMap.get(p.id))),
      meta: buildPaginationMeta(page, limit, total),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.PRODUCTS);
    return result;
  }

  async findBySlug(slug: string): Promise<ProductResponseDto> {
    const cacheKey = CACHE_KEYS.PRODUCT(slug);
    const cached = await this.cache.get<ProductResponseDto>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: { slug, ...PRODUCT_ACTIVE_WHERE },
      include: PRODUCT_DETAIL_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException(`Product "${slug}" not found`);
    }

    const related = await this.prisma.product.findMany({
      where: {
        ...PRODUCT_ACTIVE_WHERE,
        categoryId: product.categoryId,
        id: { not: product.id },
      },
      orderBy: [{ salesCount: 'desc' }, { displayOrder: 'asc' }],
      take: 8,
      include: PRODUCT_LIST_INCLUDE,
    });

    const stockMap = await this.getStockMap([
      product.id,
      ...related.map((p) => p.id),
    ]);

    const result = this.mapProduct(product, true, stockMap.get(product.id));
    result.relatedProducts = related.map((p) =>
      this.mapProduct(p, false, stockMap.get(p.id)),
    );

    await this.cache.set(cacheKey, result, CACHE_TTL.PRODUCT_DETAIL);
    return result;
  }

  async countFeatured(): Promise<number> {
    return this.prisma.product.count({
      where: { ...PRODUCT_ACTIVE_WHERE, isFeatured: true },
    });
  }

  async findFeatured(limit = 8): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { ...PRODUCT_ACTIVE_WHERE, isFeatured: true },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    return products.map((p) => this.mapProduct(p, false, stockMap.get(p.id)));
  }

  async findBestSelling(limit = 8): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        ...PRODUCT_ACTIVE_WHERE,
        OR: [{ isBestSelling: true }, { salesCount: { gt: 0 } }],
      },
      orderBy: [
        { isBestSelling: 'desc' },
        { salesCount: 'desc' },
        { displayOrder: 'asc' },
      ],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    return products.map((p) => this.mapProduct(p, false, stockMap.get(p.id)));
  }

  async findRecommended(limit = 8): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: PRODUCT_ACTIVE_WHERE,
      orderBy: [
        { isFeatured: 'desc' },
        { salesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    return products.map((p) => this.mapProduct(p, false, stockMap.get(p.id)));
  }

  async findNewArrivals(limit = 8): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        ...PRODUCT_ACTIVE_WHERE,
        OR: [
          { listingType: 'NEW_ARRIVAL' },
          { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { displayOrder: 'asc' }],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    return products.map((p) => this.mapProduct(p, false, stockMap.get(p.id)));
  }

  private isDefaultProductListQuery(
    query: ProductQueryDto,
    page: number,
    limit: number,
  ): boolean {
    return (
      page >= 1 &&
      limit === 20 &&
      !query.category &&
      !query.categorySlug &&
      !query.search &&
      !query.featured &&
      !query.bestSelling &&
      !query.listingType &&
      !query.brand &&
      !query.grade &&
      !query.status &&
      query.minPrice === undefined &&
      query.maxPrice === undefined &&
      !query.sortBy
    );
  }

  private buildWhereClause(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { ...PRODUCT_ACTIVE_WHERE };
    const categorySlug = query.category ?? query.categorySlug;

    if (categorySlug) {
      where.category = { slug: categorySlug, deletedAt: null };
    }
    if (query.featured) where.isFeatured = true;
    if (query.bestSelling) where.isBestSelling = true;
    if (query.listingType) where.listingType = query.listingType;
    if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };
    if (query.grade) where.grade = query.grade;
    if (query.status) where.status = query.status;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.retailPrice = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { nameHi: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildOrderBy(
    query: ProductQueryDto,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const sortOrder = query.sortOrder === SortOrder.ASC ? 'asc' : 'desc';

    switch (query.sortBy) {
      case 'price':
      case 'retailPrice':
        return [{ retailPrice: sortOrder }];
      case 'name':
        return [{ name: sortOrder }];
      case 'sales':
        return [{ salesCount: sortOrder }];
      case 'createdAt':
        return [{ createdAt: sortOrder }];
      default:
        return [{ displayOrder: 'asc' }, { priority: 'desc' }];
    }
  }

  private async getStockMap(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const inventory = await this.prisma.hubInventory.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { availableQty: true },
    });

    return new Map(
      inventory.map((row) => [row.productId, row._sum.availableQty ?? 0]),
    );
  }

  private resolveDeliveryEta(stockLeft: number): string {
    return stockLeft > 0 ? '1-2 days' : '3-5 days';
  }

  private mapProduct(
    product: {
      id: string;
      slug: string;
      sku: string | null;
      name: string;
      nameHi: string | null;
      detailName: string | null;
      brand: string | null;
      description: string | null;
      categoryId: string;
      grade: string | null;
      badge: string | null;
      badgeColor: string | null;
      status: string;
      spec: string | null;
      unit: string;
      retailPrice: unknown;
      gst: unknown;
      bulkPrice: unknown;
      membershipPrice?: unknown;
      bulkThreshold: number;
      bulkLabel: string | null;
      minOrder: number;
      maxOrder: number | null;
      hasVariants: boolean;
      defaultVariantId: string | null;
      perPiecePrice: unknown;
      isFeatured: boolean;
      isBestSelling: boolean;
      specs?: unknown;
      category: { id: string; slug: string; name: string };
      images: Array<{
        id: string;
        url: string;
        altText: string | null;
        isPrimary: boolean;
        displayOrder: number;
      }>;
      variants?: Array<{
        id: string;
        label: string;
        displayUnit: string | null;
        size: unknown;
        sizeUnit: string | null;
        price: unknown;
        bulkPrice: unknown;
        inStock: boolean;
      }>;
    },
    includeDetails: boolean,
    stockLeft = 0,
  ): ProductResponseDto {
    const retailPrice = Number(product.retailPrice);
    const bulkPrice = product.bulkPrice ? Number(product.bulkPrice) : null;
    const membershipPrice = product.membershipPrice
      ? Number(product.membershipPrice)
      : Math.round(retailPrice * 0.95 * 100) / 100;
    const thumbnail = product.images[0]?.url ?? null;
    const isBulkAvailable = bulkPrice != null && product.bulkThreshold > 0;

    const base: ProductResponseDto = {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      nameHi: product.nameHi,
      detailName: product.detailName,
      brand: product.brand,
      description: product.description,
      categoryId: product.categoryId,
      categorySlug: product.category.slug,
      categoryName: product.category.name,
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
      },
      grade: product.grade,
      badge: product.badge,
      badgeColor: product.badgeColor,
      status: product.status,
      spec: product.spec,
      unit: product.unit,
      retailPrice,
      price: retailPrice,
      gst: Number(product.gst),
      thumbnail,
      bulkPrice,
      bulkThreshold: product.bulkThreshold,
      bulkLabel: product.bulkLabel,
      minOrder: product.minOrder,
      maxOrder: product.maxOrder,
      hasVariants: product.hasVariants,
      defaultVariantId: product.defaultVariantId,
      perPiecePrice: product.perPiecePrice
        ? Number(product.perPiecePrice)
        : null,
      isFeatured: product.isFeatured,
      isBestSelling: product.isBestSelling,
      stockLeft,
      deliveryETA: this.resolveDeliveryEta(stockLeft),
      membershipPrice,
      isBulkAvailable,
    };

    if (includeDetails) {
      base.specs = product.specs as Record<string, string> | null;
      base.images = product.images.map((img) => ({
        id: img.id,
        url: img.url,
        imageUrl: img.url,
        altText: img.altText,
        isPrimary: img.isPrimary,
        displayOrder: img.displayOrder,
      }));
      base.variants = (product.variants ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        displayUnit: v.displayUnit,
        size: v.size ? Number(v.size) : null,
        sizeUnit: v.sizeUnit,
        price: Number(v.price),
        bulkPrice: v.bulkPrice ? Number(v.bulkPrice) : null,
        inStock: v.inStock,
      }));
    } else if (product.images.length > 0) {
      base.images = [
        {
          id: product.images[0].id,
          url: product.images[0].url,
          imageUrl: product.images[0].url,
          altText: product.images[0].altText,
          isPrimary: product.images[0].isPrimary,
          displayOrder: product.images[0].displayOrder,
        },
      ];
    }

    return base;
  }
}
