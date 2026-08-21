import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import {
  buildPaginationMeta,
  SortOrder,
} from '../../common/dto/pagination.dto';
import {
  hashQueryParams,
  PRODUCT_ACTIVE_WHERE,
} from '../../common/utils/prisma.util';
import {
  normalizeMediaUrl,
  normalizeMediaUrlList,
  pickPreferredMediaUrl,
} from '../../common/utils/media-url';
import { CoverageService } from '../coverage/coverage.service';
import { DeliveryService } from '../delivery/delivery.service';
import { parseAllowedVehicleTypes } from '../delivery/engine/delivery-load.service';
import type { ProductLogisticsSnapshot } from '../delivery/engine/delivery-load.types';
import type { DeliveryEtaCalculationResult } from '../delivery/engine/delivery-eta.logic';
import {
  displayBrickGrade,
  displayBrickProductType,
  normalizeBrickGrade,
  normalizeBrickProductType,
} from '../catalog/catalog.constants';
import {
  normalizeBulkLabel,
  normalizeCatalogUnit,
} from '../catalog/catalog-display';
import { buildProductSearchClause } from '../catalog/product-search.where';
import { ProductQueryDto } from './dto/product-query.dto';
import {
  BulkPricingTierDto,
  ProductListResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
} from './dto/product-response.dto';

const PRODUCT_LIST_INCLUDE = {
  category: {
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      parent: { select: { id: true, slug: true, name: true } },
    },
  },
  images: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }],
    take: 6,
  },
  variants: {
    where: { deletedAt: null },
    orderBy: { displayOrder: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

const PRODUCT_DETAIL_INCLUDE = {
  category: {
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      parent: { select: { id: true, slug: true, name: true } },
    },
  },
  images: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }],
  },
  variants: {
    where: { deletedAt: null },
    orderBy: { displayOrder: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

type BulkTierRaw = { minQty?: number; price?: number; label?: string | null };

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly coverageService: CoverageService,
    private readonly deliveryService: DeliveryService,
  ) {}

  async findAll(query: ProductQueryDto): Promise<ProductListResponseDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    let hubId = query.hubId;
    let distanceKm: number | null = null;

    if (query.latitude != null && query.longitude != null) {
      try {
        const hub = await this.coverageService.findNearestHub({
          latitude: query.latitude,
          longitude: query.longitude,
          pincode: query.pincode,
        });
        if (hub?.inCoverage) {
          hubId = hubId ?? hub.id;
          distanceKm = hub.distanceKm;
        }
      } catch {
        // Catalog listing still works without a coverage match.
      }
    }

    const isDefaultList = this.isDefaultProductListQuery(query, page, limit);
    const cacheKey = isDefaultList
      ? CACHE_KEYS.PRODUCTS_PAGE(page)
      : CACHE_KEYS.PRODUCTS(
          hashQueryParams({ ...query, page, limit, hubId, distanceKm }),
        );

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

    const stockMap = await this.getStockMap(
      products.map((p) => p.id),
      hubId,
    );
    const hubInvMap = await this.getHubInventoryMap(
      products.map((p) => p.id),
      hubId,
    );
    const etaMap = await this.catalogEtaMap(products, distanceKm);

    const result: ProductListResponseDto = {
      items: products.map((p) =>
        this.mapProduct(
          p,
          true,
          stockMap.get(p.id),
          hubInvMap.get(p.id),
          etaMap.get(p.id),
        ),
      ),
      meta: buildPaginationMeta(page, limit, total),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.PRODUCTS);
    return result;
  }

  async findByCategoryIdOrSlug(
    idOrSlug: string,
    query: ProductQueryDto,
  ): Promise<ProductListResponseDto> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );

    const category = await this.prisma.category.findFirst({
      where: {
        deletedAt: null,
        ...(isUuid
          ? { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }
          : { slug: idOrSlug }),
      },
      select: { id: true, slug: true },
    });

    if (!category) {
      throw new NotFoundException(`Category "${idOrSlug}" not found`);
    }

    return this.findAll({
      ...query,
      category: category.slug,
      categoryId: category.id,
    });
  }

  async findBySlug(slug: string): Promise<ProductResponseDto> {
    const cacheKey = CACHE_KEYS.PRODUCT(slug);
    const cached = await this.cache.get<ProductResponseDto>(cacheKey);
    if (cached) return cached;

    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        slug,
      );

    const product = await this.prisma.product.findFirst({
      where: {
        ...(looksLikeUuid ? { OR: [{ slug }, { id: slug }] } : { slug }),
        ...PRODUCT_ACTIVE_WHERE,
      },
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
    const hubInvMap = await this.getHubInventoryMap([
      product.id,
      ...related.map((p) => p.id),
    ]);

    const result = this.mapProduct(
      product,
      true,
      stockMap.get(product.id),
      hubInvMap.get(product.id),
    );
    result.relatedProducts = related.map((p) =>
      this.mapProduct(p, true, stockMap.get(p.id), hubInvMap.get(p.id)),
    );

    await this.cache.set(cacheKey, result, CACHE_TTL.PRODUCT_DETAIL);
    return result;
  }

  async countFeatured(): Promise<number> {
    return this.prisma.product.count({
      where: { ...PRODUCT_ACTIVE_WHERE, isFeatured: true },
    });
  }

  async findFeatured(
    limit = 8,
    distanceKm?: number | null,
  ): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: { ...PRODUCT_ACTIVE_WHERE, isFeatured: true },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    const hubInvMap = await this.getHubInventoryMap(products.map((p) => p.id));
    const etaMap = await this.catalogEtaMap(products, distanceKm);
    return products.map((p) =>
      this.mapProduct(
        p,
        true,
        stockMap.get(p.id),
        hubInvMap.get(p.id),
        etaMap.get(p.id),
      ),
    );
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
    const hubInvMap = await this.getHubInventoryMap(products.map((p) => p.id));
    return products.map((p) =>
      this.mapProduct(p, true, stockMap.get(p.id), hubInvMap.get(p.id)),
    );
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
    const hubInvMap = await this.getHubInventoryMap(products.map((p) => p.id));
    return products.map((p) =>
      this.mapProduct(p, true, stockMap.get(p.id), hubInvMap.get(p.id)),
    );
  }

  async findNewArrivals(
    limit = 8,
    distanceKm?: number | null,
  ): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: this.newArrivalsWhere(),
      orderBy: [{ createdAt: 'desc' }, { displayOrder: 'asc' }],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });
    const stockMap = await this.getStockMap(products.map((p) => p.id));
    const hubInvMap = await this.getHubInventoryMap(products.map((p) => p.id));
    const etaMap = await this.catalogEtaMap(products, distanceKm);
    return products.map((p) =>
      this.mapProduct(
        p,
        true,
        stockMap.get(p.id),
        hubInvMap.get(p.id),
        etaMap.get(p.id),
      ),
    );
  }

  /**
   * Popular products near a hub: highest orders with local inventory.
   * Falls back to global best-sellers when hubId is omitted.
   */
  async findPopularNearYou(
    limit = 10,
    hubId?: string,
    distanceKm?: number | null,
  ): Promise<ProductResponseDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        ...PRODUCT_ACTIVE_WHERE,
        OR: [{ isBestSelling: true }, { salesCount: { gt: 0 } }],
        ...(hubId
          ? {
              hubInventory: {
                some: { hubId, availableQty: { gt: 0 } },
              },
            }
          : {}),
      },
      orderBy: [
        { salesCount: 'desc' },
        { isBestSelling: 'desc' },
        { displayOrder: 'asc' },
      ],
      take: limit,
      include: PRODUCT_LIST_INCLUDE,
    });

    // If hub-scoped query yields too few, backfill with global bestsellers
    if (hubId && products.length < Math.min(4, limit)) {
      const existing = new Set(products.map((p) => p.id));
      const backfill = await this.prisma.product.findMany({
        where: {
          ...PRODUCT_ACTIVE_WHERE,
          OR: [{ isBestSelling: true }, { salesCount: { gt: 0 } }],
          id: { notIn: [...existing] },
        },
        orderBy: [{ salesCount: 'desc' }, { displayOrder: 'asc' }],
        take: limit - products.length,
        include: PRODUCT_LIST_INCLUDE,
      });
      products.push(...backfill);
    }

    const ids = products.map((p) => p.id);
    const stockMap = await this.getStockMap(ids, hubId);
    const hubInvMap = await this.getHubInventoryMap(ids, hubId);
    const etaMap = await this.catalogEtaMap(products, distanceKm);
    return products.map((p) =>
      this.mapProduct(
        p,
        true,
        stockMap.get(p.id),
        hubInvMap.get(p.id),
        etaMap.get(p.id),
      ),
    );
  }

  /**
   * Deal products: active offer campaigns, MRP discount, or bulk pricing.
   */
  async findDealProducts(
    limit = 10,
    hubId?: string,
    distanceKm?: number | null,
  ): Promise<ProductResponseDto[]> {
    const now = new Date();
    const products = await this.prisma.product.findMany({
      where: {
        ...PRODUCT_ACTIVE_WHERE,
        OR: [
          {
            offerProducts: {
              some: {
                offer: {
                  deletedAt: null,
                  status: 'ACTIVE',
                  isVisible: true,
                  AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                    { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
                  ],
                },
              },
            },
          },
          { showBulkPricing: true },
          { bulkPrice: { not: null } },
          {
            AND: [{ mrp: { not: null } }, { retailPrice: { gt: 0 } }],
          },
        ],
      },
      orderBy: [
        { isFeatured: 'desc' },
        { salesCount: 'desc' },
        { displayOrder: 'asc' },
      ],
      take: Math.min(limit * 3, 60),
      include: PRODUCT_LIST_INCLUDE,
    });

    // Prefer products with a real discount, bulk pricing, or offer link
    const ranked = products
      .map((p) => {
        const mrp = p.mrp != null ? Number(p.mrp) : 0;
        const price = Number(p.retailPrice);
        const hasDiscount = mrp > price && price > 0;
        const hasBulk =
          p.showBulkPricing === true ||
          p.bulkPrice != null ||
          (Array.isArray(p.bulkPricing) &&
            (p.bulkPricing as unknown[]).length > 0);
        const score =
          (hasDiscount ? 3 : 0) +
          (hasBulk ? 2 : 0) +
          (p.isFeatured ? 1 : 0) +
          Math.min(p.salesCount ?? 0, 100) / 100;
        return { product: p, hasDiscount, hasBulk, score };
      })
      .filter((row) => row.hasDiscount || row.hasBulk)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.product);

    // If discount/bulk filter is thin, keep top-ranked candidates (incl. campaign links)
    const finalProducts =
      ranked.length >= Math.min(4, limit) ? ranked : products.slice(0, limit);

    const ids = finalProducts.map((p) => p.id);
    const stockMap = await this.getStockMap(ids, hubId);
    const hubInvMap = await this.getHubInventoryMap(ids, hubId);
    const etaMap = await this.catalogEtaMap(finalProducts, distanceKm);
    return finalProducts.map((p) =>
      this.mapProduct(
        p,
        true,
        stockMap.get(p.id),
        hubInvMap.get(p.id),
        etaMap.get(p.id),
      ),
    );
  }

  async findHomeProducts(options?: {
    hubId?: string;
    latitude?: number;
    longitude?: number;
    pincode?: string;
    limit?: number;
    section?: 'featured' | 'popular' | 'offers' | 'new';
  }): Promise<{
    featured: ProductResponseDto[];
    popular: ProductResponseDto[];
    offers: ProductResponseDto[];
    recentlyAdded: ProductResponseDto[];
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 10, 8), 12);
    let hubId = options?.hubId;
    let distanceKm: number | null = null;

    if (options?.latitude != null && options?.longitude != null) {
      const hub = await this.coverageService.findNearestHub({
        latitude: options.latitude,
        longitude: options.longitude,
        pincode: options.pincode,
      });
      if (hub?.inCoverage) {
        hubId = hub.id;
        distanceKm = hub.distanceKm;
      }
    }

    const section = options?.section;
    const cacheKey = `${CACHE_KEYS.PRODUCTS_HOME(hubId, limit)}:${section ?? 'all'}:${distanceKm ?? 'na'}`;

    const cached = await this.cache.get<{
      featured: ProductResponseDto[];
      popular: ProductResponseDto[];
      offers: ProductResponseDto[];
      recentlyAdded: ProductResponseDto[];
    }>(cacheKey);
    if (cached) return cached;

    const empty = {
      featured: [] as ProductResponseDto[],
      popular: [] as ProductResponseDto[],
      offers: [] as ProductResponseDto[],
      recentlyAdded: [] as ProductResponseDto[],
    };

    if (section === 'featured') {
      empty.featured = await this.findFeatured(limit, distanceKm);
    } else if (section === 'popular') {
      empty.popular = await this.findPopularNearYou(limit, hubId, distanceKm);
    } else if (section === 'offers') {
      empty.offers = await this.findDealProducts(limit, hubId, distanceKm);
    } else if (section === 'new') {
      empty.recentlyAdded = await this.findNewArrivals(limit, distanceKm);
    } else {
      const [featured, popular, offers, recentlyAdded] = await Promise.all([
        this.findFeatured(limit, distanceKm),
        this.findPopularNearYou(limit, hubId, distanceKm),
        this.findDealProducts(limit, hubId, distanceKm),
        this.findNewArrivals(limit, distanceKm),
      ]);
      empty.featured = featured;
      empty.popular = popular;
      empty.offers = offers;
      empty.recentlyAdded = recentlyAdded;
    }

    await this.cache.set(cacheKey, empty, CACHE_TTL.PRODUCTS);
    return empty;
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
      !query.categoryId &&
      !query.search &&
      !query.featured &&
      !query.bestSelling &&
      !query.offers &&
      !query.newArrivals &&
      !query.listingType &&
      !query.brand &&
      !query.grade &&
      !query.productType &&
      !query.brickType &&
      !query.status &&
      query.minPrice === undefined &&
      query.maxPrice === undefined &&
      !query.sortBy &&
      query.latitude === undefined &&
      query.longitude === undefined
    );
  }

  private newArrivalsWhere(): Prisma.ProductWhereInput {
    return {
      ...PRODUCT_ACTIVE_WHERE,
      OR: [
        { listingType: 'NEW_ARRIVAL' },
        { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    };
  }

  private mergeOrFilter(
    where: Prisma.ProductWhereInput,
    orFilter: Prisma.ProductWhereInput[],
  ): void {
    if (where.OR) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        { OR: where.OR },
        { OR: orFilter },
      ];
      delete where.OR;
    } else {
      where.OR = orFilter;
    }
  }

  private buildWhereClause(query: ProductQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { ...PRODUCT_ACTIVE_WHERE };
    const categorySlug = query.category ?? query.categorySlug;

    if (query.categoryId) {
      where.OR = [
        { categoryId: query.categoryId },
        { category: { parentId: query.categoryId, deletedAt: null } },
      ];
    } else if (categorySlug) {
      where.category = {
        deletedAt: null,
        OR: [{ slug: categorySlug }, { parent: { slug: categorySlug } }],
      };
    }
    if (query.featured) where.isFeatured = true;
    if (query.bestSelling) where.isBestSelling = true;
    if (query.listingType) where.listingType = query.listingType;
    if (query.newArrivals) {
      this.mergeOrFilter(where, [
        { listingType: 'NEW_ARRIVAL' },
        { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ]);
    }
    if (query.offers) {
      const now = new Date();
      const offerOr: Prisma.ProductWhereInput[] = [
        {
          offerProducts: {
            some: {
              offer: {
                deletedAt: null,
                status: 'ACTIVE',
                isVisible: true,
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
                ],
              },
            },
          },
        },
        { showBulkPricing: true },
        { bulkPrice: { not: null } },
        {
          AND: [{ mrp: { not: null } }, { retailPrice: { gt: 0 } }],
        },
      ];
      this.mergeOrFilter(where, offerOr);
    }
    if (query.ids) {
      const ids = query.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 100);
      if (ids.length) where.id = { in: ids };
    }
    if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };
    const productTypeRaw = query.productType ?? query.brickType;
    const productType =
      normalizeBrickProductType(productTypeRaw) ?? productTypeRaw?.trim();
    const grade = normalizeBrickGrade(query.grade) ?? query.grade?.trim();
    if (productType) where.productType = productType;
    if (grade) where.grade = grade;
    if (query.status) where.status = query.status;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.retailPrice = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    if (query.search) {
      const searchClause = buildProductSearchClause(query.search);
      if (searchClause) {
        where.AND = [
          ...(Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : []),
          searchClause,
        ];
      }
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
        return [{ createdAt: sortOrder }, { displayOrder: 'asc' }];
      case 'relevance':
        return [{ salesCount: 'desc' }, { name: 'asc' }];
      default:
        if (query.search) {
          return [{ salesCount: 'desc' }, { name: 'asc' }];
        }
        return [{ displayOrder: 'asc' }, { priority: 'desc' }];
    }
  }

  private async getStockMap(
    productIds: string[],
    hubId?: string,
  ): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const inventory = await this.prisma.hubInventory.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        ...(hubId ? { hubId } : {}),
      },
      _sum: { availableQty: true },
    });

    return new Map(
      inventory.map((row) => [row.productId, row._sum.availableQty ?? 0]),
    );
  }

  private async getHubInventoryMap(
    productIds: string[],
    hubId?: string,
  ): Promise<
    Map<
      string,
      Array<{
        hubId: string;
        availableQty: number;
        variantId: string | null;
        hubName?: string;
      }>
    >
  > {
    const map = new Map<
      string,
      Array<{
        hubId: string;
        availableQty: number;
        variantId: string | null;
        hubName?: string;
      }>
    >();
    if (productIds.length === 0) return map;

    const rows = await this.prisma.hubInventory.findMany({
      where: {
        productId: { in: productIds },
        availableQty: { gt: 0 },
        ...(hubId ? { hubId } : {}),
        hub: { deletedAt: null, isActive: true },
      },
      select: {
        productId: true,
        hubId: true,
        variantId: true,
        availableQty: true,
        hub: { select: { name: true } },
      },
      take: productIds.length * 8,
    });

    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push({
        hubId: row.hubId,
        availableQty: row.availableQty,
        variantId: row.variantId,
        hubName: row.hub.name,
      });
      map.set(row.productId, list);
    }
    return map;
  }

  private discountPercent(mrp: number | null, price: number): number {
    if (!mrp || mrp <= price || mrp <= 0) return 0;
    return Math.round(((mrp - price) / mrp) * 100);
  }

  private resolveBulkPricing(product: {
    bulkPrice: unknown;
    bulkThreshold: number;
    bulkLabel: string | null;
    bulkPricing?: unknown;
  }): BulkPricingTierDto[] {
    if (Array.isArray(product.bulkPricing) && product.bulkPricing.length > 0) {
      return (product.bulkPricing as BulkTierRaw[])
        .filter(
          (t) =>
            t && typeof t.minQty === 'number' && typeof t.price === 'number',
        )
        .map((t) => ({
          minQty: t.minQty!,
          price: Number(t.price),
          label: t.label ?? `Buy ${t.minQty}+`,
        }))
        .sort((a, b) => a.minQty - b.minQty);
    }

    if (product.bulkPrice != null && product.bulkThreshold > 0) {
      return [
        {
          minQty: product.bulkThreshold,
          price: Number(product.bulkPrice),
          label: product.bulkLabel ?? `Buy ${product.bulkThreshold}+`,
        },
      ];
    }
    return [];
  }

  private mapVariants(
    variants:
      | Array<{
          id: string;
          label: string;
          displayUnit: string | null;
          size: unknown;
          sizeUnit: string | null;
          price: unknown;
          bulkPrice: unknown;
          inStock: boolean;
        }>
      | undefined,
    productMrp: number | null,
  ): ProductVariantResponseDto[] {
    return (variants ?? []).map((v) => {
      const price = Number(v.price);
      return {
        id: v.id,
        label: v.label,
        displayUnit: v.displayUnit,
        size: v.size ? Number(v.size) : null,
        sizeUnit: v.sizeUnit,
        price,
        mrp: productMrp,
        discountPercent: this.discountPercent(productMrp, price),
        bulkPrice: v.bulkPrice ? Number(v.bulkPrice) : null,
        inStock: v.inStock,
      };
    });
  }

  private async catalogEtaMap(
    products: Array<{
      id: string;
      name: string;
      unit: string;
      categoryId: string;
      weightPerUnitKg?: unknown;
      volumePerUnitCft?: unknown;
      loadType?: string | null;
      logisticsType?: string | null;
      isTransportable?: boolean;
      allowDecimalQuantity?: boolean;
      preferredVehicleType?: ProductLogisticsSnapshot['preferredVehicleType'];
      allowedVehicleTypes?: unknown;
      category?: { id: string; slug: string };
    }>,
    distanceKm?: number | null,
  ): Promise<Map<string, DeliveryEtaCalculationResult>> {
    if (distanceKm == null || products.length === 0) return new Map();
    try {
      return await this.deliveryService.previewCatalogEtas(
        products.map((p) => this.toLogisticsSnapshot(p)),
        distanceKm,
      );
    } catch {
      return new Map();
    }
  }

  private toLogisticsSnapshot(product: {
    id: string;
    name: string;
    unit: string;
    categoryId: string;
    weightPerUnitKg?: unknown;
    volumePerUnitCft?: unknown;
    loadType?: string | null;
    logisticsType?: string | null;
    isTransportable?: boolean;
    allowDecimalQuantity?: boolean;
    preferredVehicleType?: ProductLogisticsSnapshot['preferredVehicleType'];
    allowedVehicleTypes?: unknown;
    category?: { id: string; slug: string };
  }): ProductLogisticsSnapshot {
    return {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      categoryId: product.categoryId,
      categorySlug: product.category?.slug ?? null,
      weightPerUnitKg:
        product.weightPerUnitKg != null
          ? Number(product.weightPerUnitKg)
          : null,
      volumePerUnitCft:
        product.volumePerUnitCft != null
          ? Number(product.volumePerUnitCft)
          : null,
      loadType: product.loadType ?? null,
      logisticsType: product.logisticsType ?? null,
      isTransportable: product.isTransportable !== false,
      allowDecimalQuantity: product.allowDecimalQuantity === true,
      preferredVehicleType: product.preferredVehicleType ?? null,
      allowedVehicleTypes: parseAllowedVehicleTypes(
        product.allowedVehicleTypes,
      ),
    };
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
      brandLogoUrl?: string | null;
      description: string | null;
      categoryId: string;
      productType?: string | null;
      grade: string | null;
      badge: string | null;
      badgeColor: string | null;
      status: string;
      spec: string | null;
      unit: string;
      retailPrice: unknown;
      mrp?: unknown;
      gst: unknown;
      bulkPrice: unknown;
      membershipPrice?: unknown;
      bulkThreshold: number;
      bulkLabel: string | null;
      bulkPricing?: unknown;
      minOrder: number;
      maxOrder: number | null;
      incrementStep?: number;
      defaultQuantity?: number;
      weightPerUnitKg?: unknown;
      volumePerUnitCft?: unknown;
      loadType?: string | null;
      logisticsType?: string | null;
      isTransportable?: boolean;
      allowDecimalQuantity?: boolean;
      preferredVehicleType?: ProductLogisticsSnapshot['preferredVehicleType'];
      allowedVehicleTypes?: unknown;
      hasVariants: boolean;
      defaultVariantId: string | null;
      perPiecePrice: unknown;
      isFeatured: boolean;
      isBestSelling: boolean;
      listingType?: string;
      averageRating?: unknown;
      reviewCount?: number;
      deliveryETA?: string | null;
      specs?: unknown;
      updatedAt?: Date | string | null;
      category: {
        id: string;
        slug: string;
        name: string;
        parentId?: string | null;
        parent?: { id: string; slug: string; name: string } | null;
      };
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
    includeVariants: boolean,
    stockLeft = 0,
    hubInventory?: Array<{
      hubId: string;
      availableQty: number;
      variantId: string | null;
      hubName?: string;
    }>,
    etaPreview: DeliveryEtaCalculationResult | null = null,
  ): ProductResponseDto {
    const retailPrice = Number(product.retailPrice);
    const mrp = product.mrp != null ? Number(product.mrp) : null;
    const bulkPrice = product.bulkPrice ? Number(product.bulkPrice) : null;
    const membershipPrice = null;
    const preferredUrl = pickPreferredMediaUrl(
      product.images.map((img) => img.url),
    );
    const thumbnail =
      normalizeMediaUrl(preferredUrl, {
        updatedAt: product.updatedAt,
      }) ?? null;
    const gallery = normalizeMediaUrlList(
      // Put preferred URL first so adapters picking gallery[0] stay consistent.
      [
        preferredUrl,
        ...product.images
          .map((img) => img.url)
          .filter((url) => url !== preferredUrl),
      ],
      { updatedAt: product.updatedAt },
    );
    const bulkPricing = this.resolveBulkPricing(product);
    const isBulkAvailable = bulkPricing.length > 0;
    const averageRating =
      product.averageRating != null ? Number(product.averageRating) : 0;
    const reviewCount = product.reviewCount ?? 0;
    const isNewArrival = product.listingType === 'NEW_ARRIVAL';
    const variants = includeVariants
      ? this.mapVariants(product.variants, mrp)
      : undefined;
    const variantCount = product.variants?.length ?? 0;
    const deliveryEligible = stockLeft > 0;

    const parent = product.category.parent;
    const isChildCategory = Boolean(product.category.parentId && parent);

    const base: ProductResponseDto = {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      nameHi: product.nameHi,
      detailName: product.detailName,
      brand: product.brand,
      brandLogoUrl: product.brandLogoUrl ?? null,
      description: product.description,
      categoryId: product.categoryId,
      categorySlug: product.category.slug,
      categoryName: product.category.name,
      subcategoryId: isChildCategory ? product.category.id : null,
      subcategorySlug: isChildCategory ? product.category.slug : null,
      subcategoryName: isChildCategory ? product.category.name : null,
      category: {
        id: product.category.id,
        slug: product.category.slug,
        name: product.category.name,
        parentId: product.category.parentId ?? null,
      },
      grade: product.grade,
      gradeLabel: displayBrickGrade(product.grade) ?? product.grade,
      productType: product.productType ?? null,
      productTypeLabel:
        displayBrickProductType(product.productType) ??
        product.productType ??
        null,
      badge: product.badge,
      badgeColor: product.badgeColor,
      status: product.status,
      spec: product.spec,
      unit: normalizeCatalogUnit(product.unit) || product.unit,
      retailPrice,
      price: retailPrice,
      mrp,
      discountPercent: this.discountPercent(mrp, retailPrice),
      gst: Number(product.gst),
      thumbnail,
      imageUrl: thumbnail,
      gallery,
      bulkPrice,
      bulkThreshold: product.bulkThreshold,
      bulkLabel: normalizeBulkLabel(product.bulkLabel) ?? product.bulkLabel,
      bulkPricing,
      minOrder: product.minOrder,
      maxOrder: product.maxOrder,
      incrementStep: product.incrementStep ?? 1,
      defaultQuantity: product.defaultQuantity ?? product.minOrder ?? 1,
      weightPerUnit:
        product.weightPerUnitKg != null
          ? Number(product.weightPerUnitKg)
          : null,
      logisticsType: product.logisticsType ?? null,
      hasVariants: product.hasVariants || variantCount > 1,
      defaultVariantId: product.defaultVariantId,
      variantCount,
      perPiecePrice: product.perPiecePrice
        ? Number(product.perPiecePrice)
        : null,
      isFeatured: product.isFeatured,
      isBestSelling: product.isBestSelling,
      isBestseller: product.isBestSelling,
      isNewArrival,
      deliveryEligible,
      averageRating,
      reviewCount,
      rating: averageRating,
      stockLeft,
      availableStock: stockLeft,
      estimatedDeliveryMinutes: etaPreview?.etaMinutes ?? null,
      deliveryETA: etaPreview?.deliveryMessage ?? undefined,
      deliveryMessage: etaPreview?.deliveryMessage ?? undefined,
      membershipPrice,
      isBulkAvailable,
      images: product.images
        .map((img) => {
          const url =
            normalizeMediaUrl(img.url, { updatedAt: product.updatedAt }) ?? '';
          return {
            id: img.id,
            url,
            imageUrl: url,
            altText: img.altText,
            isPrimary: img.isPrimary,
            displayOrder: img.displayOrder,
          };
        })
        .filter((img) => Boolean(img.url)),
    };

    if (variants) {
      base.variants = variants;
      base.variantList = variants;
    }

    if (product.specs) {
      base.specs = product.specs as Record<string, string> | null;
    }

    return base;
  }
}
