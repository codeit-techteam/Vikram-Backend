import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { ACTIVE_WHERE, PRODUCT_ACTIVE_WHERE } from '../../common/utils/prisma.util';
import { normalizeMediaUrl } from '../../common/utils/media-url';
import {
  CategoryDetailResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(featured?: boolean): Promise<CategoryResponseDto[]> {
    const cacheKey = featured
      ? CACHE_KEYS.CATEGORIES_FEATURED
      : CACHE_KEYS.CATEGORIES;

    const cached = await this.cache.get<CategoryResponseDto[]>(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      where: {
        ...ACTIVE_WHERE,
        isVisible: true,
        ...(featured ? { isFeatured: true } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: { where: PRODUCT_ACTIVE_WHERE },
          },
        },
      },
    });

    const result = categories.map((cat) => this.mapCategory(cat));

    await this.cache.set(cacheKey, result, CACHE_TTL.CATEGORIES);
    return result;
  }

  /** Top material categories for home grid (by display order). */
  async findTop(limit = 12): Promise<CategoryResponseDto[]> {
    const cacheKey = `${CACHE_KEYS.CATEGORIES_TOP}:${limit}`;
    const cached = await this.cache.get<CategoryResponseDto[]>(cacheKey);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      where: {
        ...ACTIVE_WHERE,
        isVisible: true,
        parentId: null,
      },
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
      take: limit,
      include: {
        _count: {
          select: {
            products: { where: PRODUCT_ACTIVE_WHERE },
          },
        },
      },
    });

    const result = categories.map((cat) => this.mapCategory(cat));
    await this.cache.set(cacheKey, result, CACHE_TTL.CATEGORIES);
    return result;
  }

  async findBySlug(slug: string): Promise<CategoryDetailResponseDto> {
    const cacheKey = CACHE_KEYS.CATEGORY(slug);
    const cached = await this.cache.get<CategoryDetailResponseDto>(cacheKey);
    if (cached) return cached;

    const category = await this.prisma.category.findFirst({
      where: {
        slug,
        ...ACTIVE_WHERE,
        isVisible: true,
      },
      include: {
        _count: {
          select: {
            products: { where: PRODUCT_ACTIVE_WHERE },
          },
        },
        children: {
          where: { ...ACTIVE_WHERE, isVisible: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          include: {
            _count: {
              select: {
                products: { where: PRODUCT_ACTIVE_WHERE },
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found`);
    }

    const result: CategoryDetailResponseDto = {
      ...this.mapCategory(category),
      children: category.children.map((child) => this.mapCategory(child)),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.CATEGORY_DETAIL);
    return result;
  }

  private mapCategory(cat: {
    id: string;
    slug: string;
    name: string;
    nameHi: string | null;
    description: string | null;
    imageUrl: string | null;
    iconUrl: string | null;
    labelKey: string | null;
    displayOrder: number;
    isFeatured: boolean;
    isVisible: boolean;
    updatedAt?: Date | string | null;
    _count?: { products: number };
  }): CategoryResponseDto {
    const imageUrl = normalizeMediaUrl(cat.imageUrl, {
      updatedAt: cat.updatedAt,
    });
    const iconUrl = normalizeMediaUrl(cat.iconUrl, {
      updatedAt: cat.updatedAt,
    });
    return {
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      nameHi: cat.nameHi,
      description: cat.description,
      image: imageUrl,
      imageUrl,
      icon: iconUrl,
      iconUrl,
      labelKey: cat.labelKey,
      displayOrder: cat.displayOrder,
      isFeatured: cat.isFeatured,
      isVisible: cat.isVisible,
      productCount: cat._count?.products,
    };
  }
}
