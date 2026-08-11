import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { buildPaginationMeta } from '../../common/dto/pagination.dto';
import {
  ACTIVE_WHERE,
  hashQueryParams,
  PRODUCT_ACTIVE_WHERE,
  VISIBLE_WHERE,
} from '../../common/utils/prisma.util';
import {
  SearchQueryDto,
  SearchSuggestionsQueryDto,
} from './dto/search-query.dto';
import {
  SearchProductResultDto,
  SearchResponseDto,
  SearchSuggestionItemDto,
  SearchSuggestionsResponseDto,
} from './dto/search-response.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async search(query: SearchQueryDto): Promise<SearchResponseDto> {
    const searchTerm = (query.keyword ?? query.q ?? '').trim();
    if (!searchTerm) {
      throw new BadRequestException('keyword (or q) is required');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const category = query.category?.trim();
    const sort = query.sort?.trim() ?? 'relevance';

    const cacheKey = CACHE_KEYS.SEARCH(
      hashQueryParams({
        keyword: searchTerm,
        page,
        limit,
        category,
        sort,
      }),
    );

    const cached = await this.cache.get<SearchResponseDto>(cacheKey);
    if (cached) return cached;

    const productWhere = this.buildProductSearchWhere(searchTerm, category);
    const orderBy = this.buildProductOrderBy(sort);
    const now = new Date();

    const [total, products, categories, offers] = await Promise.all([
      this.prisma.product.count({ where: productWhere }),
      this.prisma.product.findMany({
        where: productWhere,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { slug: true, name: true } },
          images: {
            where: { deletedAt: null, isPrimary: true },
            take: 1,
          },
        },
      }),
      this.prisma.category.findMany({
        where: {
          ...ACTIVE_WHERE,
          isVisible: true,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { nameHi: { contains: searchTerm, mode: 'insensitive' } },
            { slug: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ displayOrder: 'asc' }],
        take: 10,
      }),
      this.prisma.offer.findMany({
        where: {
          ...VISIBLE_WHERE,
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { slug: { contains: searchTerm, mode: 'insensitive' } },
            { discountLabel: { contains: searchTerm, mode: 'insensitive' } },
          ],
          AND: [
            {
              OR: [
                { startsAt: null, endsAt: null },
                { startsAt: { lte: now }, endsAt: null },
                { startsAt: null, endsAt: { gte: now } },
                { startsAt: { lte: now }, endsAt: { gte: now } },
              ],
            },
          ],
        },
        orderBy: [{ priority: 'desc' }],
        take: 10,
      }),
    ]);

    await Promise.all([
      this.recordSearchHistory(searchTerm, total),
      this.bumpPopularSearch(searchTerm),
    ]);

    const productItems = products.map((p) => this.mapProductResult(p));

    const result: SearchResponseDto = {
      products: productItems,
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        image: c.imageUrl,
      })),
      offers: offers.map((o) => ({
        id: o.id,
        slug: o.slug,
        title: o.title,
        discountLabel: o.discountLabel,
        bannerImage: o.imageUrl,
      })),
      items: productItems,
      meta: {
        ...buildPaginationMeta(page, limit, total),
        query: searchTerm,
      },
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.SEARCH);
    return result;
  }

  async getSuggestions(
    query: SearchSuggestionsQueryDto,
  ): Promise<SearchSuggestionsResponseDto> {
    const term = (query.keyword ?? query.q ?? '').trim();
    const limit = query.limit ?? 10;
    const cacheKey = CACHE_KEYS.SEARCH_SUGGESTIONS(
      term ? term.toLowerCase() : 'empty',
    );

    const cached =
      await this.cache.get<SearchSuggestionsResponseDto>(cacheKey);
    if (cached) return cached;

    const [popularSearches, recentSearches, matches] = await Promise.all([
      this.getPopularSearches(8),
      this.getRecentSearches(8),
      term
        ? this.getMatchingGroups(term, limit)
        : Promise.resolve({
            matchingProducts: [] as SearchSuggestionItemDto[],
            matchingCategories: [] as SearchSuggestionItemDto[],
            matchingOffers: [] as SearchSuggestionItemDto[],
          }),
    ]);

    const matching = [
      ...matches.matchingCategories,
      ...matches.matchingOffers,
      ...matches.matchingProducts,
    ].slice(0, limit);

    const result: SearchSuggestionsResponseDto = {
      popularSearches,
      recentSearches,
      matchingProducts: matches.matchingProducts,
      matchingCategories: matches.matchingCategories,
      matchingOffers: matches.matchingOffers,
      popular: popularSearches,
      recent: recentSearches,
      matching,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.SEARCH_SUGGESTIONS);
    return result;
  }

  async getPopularSearches(limit = 10): Promise<string[]> {
    const cacheKey = CACHE_KEYS.SEARCH_POPULAR;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const curated = await this.prisma.popularSearch.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { searchCount: 'desc' }],
      take: limit,
      select: { query: true },
    });

    if (curated.length > 0) {
      const terms = curated.map((p) => p.query);
      await this.cache.set(cacheKey, terms, CACHE_TTL.SEARCH_POPULAR);
      return terms;
    }

    return this.getTrending(limit);
  }

  async getTrending(limit = 10): Promise<string[]> {
    const cacheKey = CACHE_KEYS.SEARCH_TRENDING;
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trending = await this.prisma.searchHistory.groupBy({
      by: ['query'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: limit,
    });

    const terms = trending.map((t) => t.query);

    if (terms.length === 0) {
      const fallback = [
        'UltraTech Cement',
        'RMC M25',
        'River Sand',
        'Red Bricks',
        'Fly Ash Bricks',
        'Stone Chips',
      ];
      await this.cache.set(cacheKey, fallback, CACHE_TTL.SEARCH_TRENDING);
      return fallback;
    }

    await this.cache.set(cacheKey, terms, CACHE_TTL.SEARCH_TRENDING);
    return terms;
  }

  private async getRecentSearches(limit: number): Promise<string[]> {
    const recent = await this.prisma.searchHistory.findMany({
      distinct: ['query'],
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { query: true },
    });
    return recent.map((r) => r.query);
  }

  private async getMatchingGroups(
    term: string,
    limit: number,
  ): Promise<{
    matchingProducts: SearchSuggestionItemDto[];
    matchingCategories: SearchSuggestionItemDto[];
    matchingOffers: SearchSuggestionItemDto[];
  }> {
    const [products, categories, offers] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          ...PRODUCT_ACTIVE_WHERE,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          slug: true,
          name: true,
          images: {
            where: { deletedAt: null, isPrimary: true },
            take: 1,
            select: { url: true },
          },
        },
        take: limit,
        orderBy: { salesCount: 'desc' },
      }),
      this.prisma.category.findMany({
        where: {
          ...ACTIVE_WHERE,
          isVisible: true,
          name: { contains: term, mode: 'insensitive' },
        },
        select: { slug: true, name: true, imageUrl: true },
        take: 5,
      }),
      this.prisma.offer.findMany({
        where: {
          ...VISIBLE_WHERE,
          title: { contains: term, mode: 'insensitive' },
        },
        select: { slug: true, title: true, imageUrl: true },
        take: 5,
      }),
    ]);

    return {
      matchingProducts: products.map((p) => ({
        text: p.name,
        type: 'product' as const,
        slug: p.slug,
        imageUrl: p.images[0]?.url ?? null,
      })),
      matchingCategories: categories.map((c) => ({
        text: c.name,
        type: 'category' as const,
        slug: c.slug,
        imageUrl: c.imageUrl,
      })),
      matchingOffers: offers.map((o) => ({
        text: o.title,
        type: 'offer' as const,
        slug: o.slug,
        imageUrl: o.imageUrl,
      })),
    };
  }

  private buildProductSearchWhere(
    term: string,
    categorySlug?: string,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      ...PRODUCT_ACTIVE_WHERE,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { nameHi: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { grade: { contains: term, mode: 'insensitive' } },
        { productType: { contains: term, mode: 'insensitive' } },
        { metaKeywords: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
        { category: { slug: { contains: term, mode: 'insensitive' } } },
        ...(term.toLowerCase().includes('fly ash') ||
        term.toLowerCase().includes('grey ash')
          ? [{ productType: 'GREY_ASH_BRICKS' as const }]
          : []),
        ...(term.toLowerCase() === 'rmc' ||
        term.toLowerCase().includes('ready mix')
          ? [{ category: { slug: 'rmc' } }]
          : []),
      ],
    };

    if (categorySlug) {
      where.category = { slug: categorySlug, deletedAt: null };
    }

    return where;
  }

  private buildProductOrderBy(
    sort: string,
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
      case 'price-asc':
        return [{ retailPrice: 'asc' }];
      case 'price_desc':
      case 'price-desc':
        return [{ retailPrice: 'desc' }];
      case 'newest':
        return [{ createdAt: 'desc' }];
      case 'sales':
        return [{ salesCount: 'desc' }];
      case 'name':
        return [{ name: 'asc' }];
      case 'relevance':
      default:
        return [{ salesCount: 'desc' }, { name: 'asc' }];
    }
  }

  private mapProductResult(product: {
    id: string;
    slug: string;
    name: string;
    brand: string | null;
    retailPrice: unknown;
    badge: string | null;
    unit: string;
    category: { slug: string; name: string };
    images: Array<{ url: string }>;
  }): SearchProductResultDto {
    const price = Number(product.retailPrice);
    const imageUrl = product.images[0]?.url ?? null;
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      categorySlug: product.category.slug,
      categoryName: product.category.name,
      price,
      retailPrice: price,
      thumbnail: imageUrl,
      imageUrl,
      badge: product.badge,
      unit: product.unit,
    };
  }

  private async recordSearchHistory(
    query: string,
    resultCount: number,
  ): Promise<void> {
    try {
      await this.prisma.searchHistory.create({
        data: { query, resultCount },
      });
    } catch {
      // Non-blocking analytics write
    }
  }

  private async bumpPopularSearch(query: string): Promise<void> {
    try {
      await this.prisma.popularSearch.upsert({
        where: { query },
        create: { query, searchCount: 1 },
        update: { searchCount: { increment: 1 } },
      });
      await this.cache.del(CACHE_KEYS.SEARCH_POPULAR);
    } catch {
      // Non-blocking popularity write
    }
  }
}
