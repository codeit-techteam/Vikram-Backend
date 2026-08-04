import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateProductDto,
  UpdateProductDto,
  UpdateInventoryDto,
  ProductQueryDto,
} from './dto/admin-products.dto';

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

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
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        nameHi: dto.nameHi,
        slug: dto.slug,
        sku: dto.sku,
        categoryId: dto.categoryId,
        brand: dto.brand,
        description: dto.description,
        grade: dto.grade,
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
    await this.cache.invalidateProducts();
    return product;
  }

  async update(id: string, dto: UpdateProductDto & { isVisible?: boolean }) {
    await this.findOne(id);
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
