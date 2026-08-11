import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
} from './dto/admin-products.dto';

const MAIN_WAREHOUSE_CODE = 'WH-GURUGRAM';

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
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
              label: true,
              displayUnit: true,
              size: true,
              sizeUnit: true,
              price: true,
              inStock: true,
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
        images: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' } },
        variants: { where: { deletedAt: null } },
        hubInventory: {
          include: { hub: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto & { imageUrls?: string[]; isVisible?: boolean }) {
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
          stockLeft: dto.initialStock ?? 0,
          images: dto.imageUrls?.length
            ? {
                create: dto.imageUrls.map((url, index) => ({
                  url,
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
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(attrs && {
          productType: attrs.productType,
          grade: attrs.grade,
        }),
        ...(dto.entityStatus !== undefined && {
          entityStatus: dto.entityStatus as any,
        }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
      },
    });
    await this.cache.invalidateProducts();
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

  async setImages(
    productId: string,
    images: Array<{ url: string; altText?: string; isPrimary?: boolean }>,
  ) {
    await this.findOne(productId);
    await this.prisma.productImage.updateMany({
      where: { productId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (images.length) {
      await this.prisma.productImage.createMany({
        data: images.map((img, index) => ({
          productId,
          url: img.url,
          altText: img.altText,
          displayOrder: index,
          isPrimary: img.isPrimary ?? index === 0,
        })),
      });
    }
    await this.cache.invalidateProducts();
    return this.findOne(productId);
  }

  async addImage(
    productId: string,
    image: { url: string; altText?: string; isPrimary?: boolean },
  ) {
    await this.findOne(productId);
    if (image.isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, deletedAt: null },
        data: { isPrimary: false },
      });
    }
    const count = await this.prisma.productImage.count({
      where: { productId, deletedAt: null },
    });
    const created = await this.prisma.productImage.create({
      data: {
        productId,
        url: image.url,
        altText: image.altText,
        displayOrder: count,
        isPrimary: image.isPrimary ?? count === 0,
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
    if (!image) throw new NotFoundException('Product image not found');
    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { deletedAt: new Date() },
    });
    await this.cache.invalidateProducts();
    return { deleted: true };
  }

  async bulkUpload(products: CreateProductDto[]) {
    const results = await Promise.allSettled(
      products.map((dto) => this.create(dto)),
    );
    const created = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { created, failed, total: products.length };
  }
}
