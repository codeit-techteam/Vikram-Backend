import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { validateAndNormalizeCatalogAttributes } from '../../modules/catalog/catalog-validation';
import {
  normalizeBrickGrade,
  normalizeBrickProductType,
} from '../../modules/catalog/catalog.constants';
import type {
  CreateProductDto,
  UpdateProductDto,
  UpdateInventoryDto,
  ProductQueryDto,
  ProductImageItemDto,
  SetProductVideoDto,
} from './dto/admin-products.dto';
import { hydrateMissingVariantsFromCommerceMeta } from '../../common/shopping/product-variant-hydrate';
import { R2StorageService } from '../../storage/r2.service';
import { extractStorageKeyFromUrl } from '../../storage/r2';
import { PRODUCT_MEDIA_LIMITS } from './product-media.constants';

const MAIN_WAREHOUSE_CODE = 'WH-GURUGRAM';

@Injectable()
export class AdminProductsService {
  private readonly logger = new Logger(AdminProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: R2StorageService,
  ) {}

  private async resolveCentralWarehouse() {
    let warehouse = await this.prisma.hub.findFirst({
      where: {
        deletedAt: null,
        OR: [{ code: MAIN_WAREHOUSE_CODE }, { hubType: 'CENTRAL_WAREHOUSE' }],
      },
    });
    if (!warehouse) {
      warehouse = await this.prisma.hub.create({
        data: {
          code: MAIN_WAREHOUSE_CODE,
          name: 'Main Warehouse Gurugram',
          addressLine1: 'Sector 18, Gurugram',
          city: 'Gurugram',
          state: 'Haryana',
          pincode: '122015',
          latitude: 28.4595,
          longitude: 77.0266,
          hubType: 'CENTRAL_WAREHOUSE',
          warehouseId: 'wh-main-gurugram',
          warehouseCode: 'Main Warehouse Gurugram',
          isActive: true,
        },
      });
    }
    return warehouse;
  }

  async findAll(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };

    if (query.search) {
      where['OR'] = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where['categoryId'] = query.categoryId;
    if (query.status) where['entityStatus'] = query.status;
    const productType =
      normalizeBrickProductType(query.productType) ?? query.productType;
    const grade = normalizeBrickGrade(query.grade) ?? query.grade;
    if (productType) where['productType'] = productType;
    if (grade) where['grade'] = grade;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          images: {
            where: { deletedAt: null },
            orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
          },
          variants: {
            where: { deletedAt: null },
            orderBy: { displayOrder: 'asc' },
            select: {
              id: true,
              attribute: true,
              value: true,
              attributes: true,
              label: true,
              displayUnit: true,
              size: true,
              sizeUnit: true,
              sku: true,
              price: true,
              mrp: true,
              stock: true,
              inStock: true,
              isActive: true,
              imageUrl: true,
              displayOrder: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        images: {
          where: { deletedAt: null },
          orderBy: { displayOrder: 'asc' },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        hubInventory: {
          include: { hub: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(
    dto: CreateProductDto & { imageUrls?: string[]; isVisible?: boolean },
  ) {
    if (dto.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { sku: dto.sku, deletedAt: null },
      });
      if (existingSku) {
        throw new BadRequestException('SKU already exists');
      }
    }

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
    });
    if (!category) {
      throw new BadRequestException('Invalid categoryId');
    }

    const attrs = validateAndNormalizeCatalogAttributes({
      categorySlug: category.slug,
      productType: dto.productType,
      grade: dto.grade,
    });

    const warehouse =
      dto.initialStock !== undefined || dto.lowStockThreshold !== undefined
        ? await this.resolveCentralWarehouse()
        : null;

    const imageUrls = dto.imageUrls ?? [];
    if (imageUrls.length > PRODUCT_MEDIA_LIMITS.MAX_IMAGES) {
      throw new BadRequestException(
        `Maximum ${PRODUCT_MEDIA_LIMITS.MAX_IMAGES} product images are allowed.`,
      );
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name,
          nameHi: dto.nameHi,
          slug: dto.slug,
          sku: dto.sku,
          categoryId: dto.categoryId,
          brand: dto.brand,
          description: dto.description,
          productType: attrs.productType,
          grade: attrs.grade,
          retailPrice: dto.retailPrice,
          mrp: dto.mrp,
          bulkPrice: dto.bulkPrice,
          membershipPrice: dto.membershipPrice,
          bulkThreshold: dto.bulkThreshold ?? 50,
          unit: dto.unit ?? 'Bag',
          minOrder: dto.minOrder ?? 1,
          maxOrder: dto.maxOrder,
          gst: dto.gst ?? 18,
          isFeatured: dto.isFeatured ?? false,
          isBestSelling: dto.isBestSelling ?? false,
          listingType: (dto.listingType as any) ?? 'STANDARD',
          displayOrder: dto.displayOrder ?? 0,
          isVisible: dto.isVisible ?? true,
          hasVariants: dto.hasVariants ?? false,
          stockLeft: dto.initialStock ?? 0,
          images: imageUrls.length
            ? {
                create: imageUrls.map((url, index) => ({
                  url,
                  type: 'IMAGE' as const,
                  displayOrder: index,
                  isPrimary: index === 0,
                })),
              }
            : undefined,
        },
        include: { images: true, category: true },
      });

      if (warehouse) {
        const initial = dto.initialStock ?? 0;
        await tx.hubInventory.upsert({
          where: {
            hubId_productId: { hubId: warehouse.id, productId: created.id },
          },
          create: {
            hubId: warehouse.id,
            productId: created.id,
            availableQty: initial,
            reservedQty: 0,
            lowStockThreshold: dto.lowStockThreshold ?? 10,
            minimumStock: dto.minimumStock ?? dto.lowStockThreshold ?? 0,
            maximumStock: dto.maximumStock,
          },
          update: {
            availableQty: initial,
            lowStockThreshold: dto.lowStockThreshold ?? 10,
            minimumStock: dto.minimumStock ?? dto.lowStockThreshold ?? 0,
            ...(dto.maximumStock !== undefined && {
              maximumStock: dto.maximumStock,
            }),
          },
        });

        if (initial > 0) {
          await tx.inventoryLedgerEntry.create({
            data: {
              hubId: warehouse.id,
              productId: created.id,
              type: 'ADJUSTMENT',
              quantity: initial,
              openingQty: 0,
              closingQty: initial,
              referenceNo: `INIT-${created.sku ?? created.id.slice(0, 8)}`,
              remarks: 'INITIAL_STOCK',
              createdBy: 'system',
            },
          });
        }
      }

      return created;
    });

    await this.cache.invalidateProducts();
    await hydrateMissingVariantsFromCommerceMeta(this.prisma, product);
    return product;
  }

  async update(id: string, dto: UpdateProductDto & { isVisible?: boolean }) {
    const existing = await this.findOne(id);

    let categorySlug = existing.category?.slug ?? null;
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, deletedAt: null },
      });
      if (!category) {
        throw new BadRequestException('Invalid categoryId');
      }
      categorySlug = category.slug;
    }

    const shouldValidateAttrs =
      dto.productType !== undefined ||
      dto.grade !== undefined ||
      dto.categoryId !== undefined;

    const attrs = shouldValidateAttrs
      ? validateAndNormalizeCatalogAttributes({
          categorySlug,
          productType:
            dto.productType !== undefined
              ? dto.productType
              : existing.productType,
          grade: dto.grade !== undefined ? dto.grade : existing.grade,
        })
      : null;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.brand !== undefined && { brand: dto.brand }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.retailPrice !== undefined && { retailPrice: dto.retailPrice }),
        ...(dto.mrp !== undefined && { mrp: dto.mrp }),
        ...(dto.bulkPrice !== undefined && { bulkPrice: dto.bulkPrice }),
        ...(dto.bulkThreshold !== undefined && {
          bulkThreshold: dto.bulkThreshold,
        }),
        ...(dto.membershipPrice !== undefined && {
          membershipPrice: dto.membershipPrice,
        }),
        ...(dto.unit !== undefined && {
          unit: dto.unit.trim() || existing.unit,
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(attrs && {
          productType: attrs.productType,
          grade: attrs.grade,
        }),
        ...(dto.entityStatus !== undefined && {
          entityStatus: dto.entityStatus as any,
        }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        ...(dto.hasVariants !== undefined && { hasVariants: dto.hasVariants }),
      },
    });
    await this.cache.invalidateProducts();
    await hydrateMissingVariantsFromCommerceMeta(this.prisma, {
      ...product,
      description: product.description ?? existing.description,
    });
    return product;
  }

  async remove(id: string) {
    await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.cache.invalidateProducts();
    return product;
  }

  async updateStock(id: string, status: string) {
    await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { status },
    });
    await this.cache.invalidateProducts();
    return product;
  }

  async updateMembershipPrice(id: string, price: number) {
    await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { membershipPrice: price },
    });
    await this.cache.invalidateProducts();
    return product;
  }

  async updateBulkPrice(id: string, price: number, threshold?: number) {
    await this.findOne(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        bulkPrice: price,
        ...(threshold !== undefined && { bulkThreshold: threshold }),
      },
    });
    await this.cache.invalidateProducts();
    return product;
  }

  async updateInventory(productId: string, dto: UpdateInventoryDto) {
    await this.findOne(productId);
    const inventory = await this.prisma.hubInventory.upsert({
      where: { hubId_productId: { hubId: dto.hubId, productId } },
      create: {
        hubId: dto.hubId,
        productId,
        availableQty: dto.availableQty,
        reservedQty: dto.reservedQty ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 10,
      },
      update: {
        availableQty: dto.availableQty,
        ...(dto.reservedQty !== undefined && { reservedQty: dto.reservedQty }),
        ...(dto.lowStockThreshold !== undefined && {
          lowStockThreshold: dto.lowStockThreshold,
        }),
      },
    });
    await this.cache.invalidateProducts();
    return inventory;
  }

  async setImages(productId: string, images: ProductImageItemDto[]) {
    await this.findOne(productId);

    if (images.length > PRODUCT_MEDIA_LIMITS.MAX_IMAGES) {
      throw new BadRequestException(
        `Maximum ${PRODUCT_MEDIA_LIMITS.MAX_IMAGES} product images are allowed.`,
      );
    }

    for (const img of images) {
      if (img.type === 'VIDEO') {
        throw new BadRequestException(
          'Use the product video endpoint for video media.',
        );
      }
      this.assertHttpUrl(img.url);
    }

    const previous = await this.prisma.productImage.findMany({
      where: { productId, deletedAt: null, type: 'IMAGE' },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId, deletedAt: null, type: 'IMAGE' },
        data: { deletedAt: new Date(), isPrimary: false },
      });

      if (!images.length) return;

      const primaryIndex = images.findIndex((img) => img.isPrimary);
      const resolvedPrimary = primaryIndex >= 0 ? primaryIndex : 0;

      for (let index = 0; index < images.length; index++) {
        const img = images[index];
        await tx.productImage.create({
          data: {
            productId,
            type: 'IMAGE',
            url: img.url,
            storageKey: img.storageKey ?? this.keyFromUrl(img.url),
            mimeType: img.mimeType,
            fileSize:
              img.fileSize != null ? BigInt(img.fileSize) : undefined,
            thumbnailUrl: img.thumbnailUrl,
            altText: img.altText,
            displayOrder: index,
            isPrimary: index === resolvedPrimary,
          },
        });
      }
    });

    await this.bestEffortDeleteOrphans(
      previous,
      images.map((i) => i.url),
    );
    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async addImage(productId: string, image: ProductImageItemDto) {
    await this.findOne(productId);
    this.assertHttpUrl(image.url);

    if (image.type === 'VIDEO') {
      throw new BadRequestException(
        'Use the product video endpoint for video media.',
      );
    }

    const count = await this.prisma.productImage.count({
      where: { productId, deletedAt: null, type: 'IMAGE' },
    });
    if (count >= PRODUCT_MEDIA_LIMITS.MAX_IMAGES) {
      throw new BadRequestException(
        `Maximum ${PRODUCT_MEDIA_LIMITS.MAX_IMAGES} product images are allowed.`,
      );
    }

    const makePrimary = image.isPrimary ?? count === 0;
    if (makePrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, deletedAt: null, type: 'IMAGE' },
        data: { isPrimary: false },
      });
    }

    const created = await this.prisma.productImage.create({
      data: {
        productId,
        type: 'IMAGE',
        url: image.url,
        storageKey: image.storageKey ?? this.keyFromUrl(image.url),
        mimeType: image.mimeType,
        fileSize: image.fileSize != null ? BigInt(image.fileSize) : undefined,
        thumbnailUrl: image.thumbnailUrl,
        altText: image.altText,
        displayOrder: count,
        isPrimary: makePrimary,
      },
    });
    await this.cache.invalidateProducts();
    return created;
  }

  async removeImage(productId: string, imageId: string) {
    await this.findOne(productId);
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId, deletedAt: null },
    });
    if (!image) throw new NotFoundException('Product media not found');

    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { deletedAt: new Date(), isPrimary: false },
    });

    if (image.type === 'IMAGE' && image.isPrimary) {
      const nextPrimary = await this.prisma.productImage.findFirst({
        where: { productId, deletedAt: null, type: 'IMAGE' },
        orderBy: { displayOrder: 'asc' },
      });
      if (nextPrimary) {
        await this.prisma.productImage.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    await this.renumberDisplayOrder(productId);
    await this.bestEffortDeleteKeys([
      image.storageKey ?? this.keyFromUrl(image.url),
    ]);
    await this.cache.invalidateProducts();
    return { deleted: true };
  }

  async setVideo(productId: string, dto: SetProductVideoDto) {
    await this.findOne(productId);
    this.assertHttpUrl(dto.url);

    const existing = await this.prisma.productImage.findMany({
      where: { productId, deletedAt: null, type: 'VIDEO' },
    });
    const nextKey = dto.storageKey ?? this.keyFromUrl(dto.url);
    const sameObject = existing.some((row) =>
      this.isSameMediaObject(row, dto.url, nextKey),
    );

    if (sameObject && existing.length === 1) {
      await this.prisma.productImage.update({
        where: { id: existing[0].id },
        data: {
          url: dto.url,
          storageKey: nextKey ?? existing[0].storageKey,
          mimeType: dto.mimeType ?? existing[0].mimeType,
          fileSize:
            dto.fileSize != null ? BigInt(dto.fileSize) : existing[0].fileSize,
          thumbnailUrl: dto.thumbnailUrl ?? existing[0].thumbnailUrl,
          altText: dto.altText ?? existing[0].altText,
        },
      });
      await this.cache.invalidateProducts();
      return this.findOne(productId);
    }

    const maxImageOrder = await this.prisma.productImage.aggregate({
      where: { productId, deletedAt: null, type: 'IMAGE' },
      _max: { displayOrder: true },
    });
    const displayOrder = (maxImageOrder._max.displayOrder ?? -1) + 1;

    await this.prisma.$transaction(async (tx) => {
      if (existing.length) {
        await tx.productImage.updateMany({
          where: { productId, deletedAt: null, type: 'VIDEO' },
          data: { deletedAt: new Date(), isPrimary: false },
        });
      }

      await tx.productImage.create({
        data: {
          productId,
          type: 'VIDEO',
          url: dto.url,
          storageKey: nextKey,
          mimeType: dto.mimeType,
          fileSize: dto.fileSize != null ? BigInt(dto.fileSize) : undefined,
          thumbnailUrl: dto.thumbnailUrl,
          altText: dto.altText,
          displayOrder,
          isPrimary: false,
        },
      });
    });

    await this.bestEffortDeleteOrphans(existing, [dto.url], nextKey);
    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async removeVideo(productId: string) {
    await this.findOne(productId);
    const videos = await this.prisma.productImage.findMany({
      where: { productId, deletedAt: null, type: 'VIDEO' },
    });
    if (!videos.length) {
      throw new NotFoundException('Product video not found');
    }

    await this.prisma.productImage.updateMany({
      where: { productId, deletedAt: null, type: 'VIDEO' },
      data: { deletedAt: new Date(), isPrimary: false },
    });

    await this.bestEffortDeleteKeys(
      videos.map((v) => v.storageKey ?? this.keyFromUrl(v.url)),
    );
    await this.renumberDisplayOrder(productId);
    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async reorderMedia(productId: string, mediaIds: string[]) {
    await this.findOne(productId);
    if (!mediaIds.length) {
      throw new BadRequestException('mediaIds is required');
    }

    const existing = await this.prisma.productImage.findMany({
      where: { productId, deletedAt: null },
    });
    const existingIds = new Set(existing.map((m) => m.id));
    for (const id of mediaIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Unknown media id: ${id}`);
      }
    }
    if (mediaIds.length !== existing.length) {
      throw new BadRequestException(
        'mediaIds must include every active media item exactly once',
      );
    }

    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );

    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async setPrimaryImage(productId: string, mediaId: string) {
    await this.findOne(productId);
    const media = await this.prisma.productImage.findFirst({
      where: { id: mediaId, productId, deletedAt: null },
    });
    if (!media) throw new NotFoundException('Product media not found');
    if (media.type !== 'IMAGE') {
      throw new BadRequestException('Only images can be set as primary');
    }

    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId, deletedAt: null, type: 'IMAGE' },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: mediaId },
        data: { isPrimary: true },
      }),
    ]);

    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async replaceMedia(
    productId: string,
    mediaId: string,
    payload: ProductImageItemDto,
  ) {
    await this.findOne(productId);
    this.assertHttpUrl(payload.url);

    const existing = await this.prisma.productImage.findFirst({
      where: { id: mediaId, productId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Product media not found');

    const nextType = payload.type ?? existing.type;
    if (nextType !== existing.type) {
      throw new BadRequestException('Cannot change media type on replace');
    }

    const updated = await this.prisma.productImage.update({
      where: { id: mediaId },
      data: {
        url: payload.url,
        storageKey: payload.storageKey ?? this.keyFromUrl(payload.url),
        mimeType: payload.mimeType ?? existing.mimeType,
        fileSize:
          payload.fileSize != null
            ? BigInt(payload.fileSize)
            : existing.fileSize,
        thumbnailUrl: payload.thumbnailUrl ?? existing.thumbnailUrl,
        altText: payload.altText ?? existing.altText,
      },
    });

    const oldKey = existing.storageKey ?? this.keyFromUrl(existing.url);
    const newKey = updated.storageKey ?? this.keyFromUrl(updated.url);
    if (oldKey && oldKey !== newKey) {
      await this.bestEffortDeleteKeys([oldKey]);
    }

    await this.cache.invalidateProducts();
    return updated;
  }

  async bulkUpload(products: CreateProductDto[]) {
    const results = await Promise.allSettled(
      products.map((dto) => this.create(dto)),
    );
    const created = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { created, failed, total: products.length };
  }

  private assertHttpUrl(url: string) {
    if (!/^https?:\/\//i.test(url.trim())) {
      throw new BadRequestException('Media URL must be an absolute http(s) URL');
    }
  }

  private keyFromUrl(url: string): string | undefined {
    try {
      return extractStorageKeyFromUrl(url) || undefined;
    } catch {
      return undefined;
    }
  }

  private canonicalMediaUrl(url?: string | null): string {
    return (url ?? '').trim().split('?')[0].split('#')[0];
  }

  private isSameMediaObject(
    row: { url: string; storageKey: string | null },
    nextUrl: string,
    nextKey?: string | null,
  ): boolean {
    const rowKey = row.storageKey ?? this.keyFromUrl(row.url);
    if (nextKey && rowKey && nextKey === rowKey) return true;
    return this.canonicalMediaUrl(row.url) === this.canonicalMediaUrl(nextUrl);
  }

  private async renumberDisplayOrder(productId: string) {
    const rows = await this.prisma.productImage.findMany({
      where: { productId, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    await this.prisma.$transaction(
      rows.map((row, index) =>
        this.prisma.productImage.update({
          where: { id: row.id },
          data: { displayOrder: index },
        }),
      ),
    );
  }

  private async bestEffortDeleteOrphans(
    previous: Array<{ url: string; storageKey: string | null }>,
    keepUrls: string[],
    keepKey?: string | null,
  ) {
    const keepUrlSet = new Set(keepUrls.map((url) => this.canonicalMediaUrl(url)));
    const keepKeys = new Set(
      [
        keepKey,
        ...keepUrls.map((url) => this.keyFromUrl(url)),
      ].filter((key): key is string => Boolean(key)),
    );
    const keys = previous
      .filter((row) => {
        const rowKey = row.storageKey ?? this.keyFromUrl(row.url);
        if (rowKey && keepKeys.has(rowKey)) return false;
        return !keepUrlSet.has(this.canonicalMediaUrl(row.url));
      })
      .map((row) => row.storageKey ?? this.keyFromUrl(row.url))
      .filter((key): key is string => Boolean(key));
    await this.bestEffortDeleteKeys(keys);
  }

  private async bestEffortDeleteKeys(keys: Array<string | null | undefined>) {
    for (const key of keys) {
      if (!key) continue;
      try {
        await this.storage.deleteFile(key);
      } catch (error) {
        this.logger.warn(
          `Failed to delete R2 object ${key}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
