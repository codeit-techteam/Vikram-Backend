import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateProductDto, UpdateProductDto, UpdateInventoryDto, ProductQueryDto } from './dto/admin-products.dto';

@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
          images: { where: { isPrimary: true }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        images: true,
        variants: { where: { deletedAt: null } },
        hubInventory: { include: { hub: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    return this.prisma.product.create({
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
      },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.brand !== undefined && { brand: dto.brand }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.retailPrice !== undefined && { retailPrice: dto.retailPrice }),
        ...(dto.bulkPrice !== undefined && { bulkPrice: dto.bulkPrice }),
        ...(dto.membershipPrice !== undefined && { membershipPrice: dto.membershipPrice }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.entityStatus !== undefined && { entityStatus: dto.entityStatus as any }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async updateStock(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  async updateMembershipPrice(id: string, price: number) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: { membershipPrice: price } });
  }

  async updateBulkPrice(id: string, price: number, threshold?: number) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { bulkPrice: price, ...(threshold !== undefined && { bulkThreshold: threshold }) },
    });
  }

  async updateInventory(productId: string, dto: UpdateInventoryDto) {
    await this.findOne(productId);
    return this.prisma.hubInventory.upsert({
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
        ...(dto.lowStockThreshold !== undefined && { lowStockThreshold: dto.lowStockThreshold }),
      },
    });
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
