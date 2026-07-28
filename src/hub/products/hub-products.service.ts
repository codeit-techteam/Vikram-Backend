import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubInventoryRepository } from '../repositories/hub-inventory.repository';
import type { HubProductEtaDto, HubProductsQueryDto, HubProductStockDto } from '../dto/hub.dto';

@Injectable()
export class HubProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async findAll(hubId: string, query: HubProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId };
    if (query.search) {
      where['product'] = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
        deletedAt: null,
      };
    } else {
      where['product'] = { deletedAt: null };
    }

    const [rows, total] = await Promise.all([
      this.prisma.hubInventory.findMany({
        where,
        skip,
        take: limit,
        include: this.inventoryRepo.inventoryInclude(),
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.hubInventory.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.inventoryRepo.mapInventoryRow(row)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(hubId: string, productId: string) {
    const row = await this.prisma.hubInventory.findFirst({
      where: { hubId, productId },
      include: {
        product: {
          include: {
            images: { orderBy: { displayOrder: 'asc' } },
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!row) throw new NotFoundException('Product not found at this hub');

    return {
      ...this.inventoryRepo.mapInventoryRow(row),
      product: row.product,
    };
  }

  async updateStock(hubId: string, productId: string, dto: HubProductStockDto) {
    const row = await this.prisma.hubInventory.upsert({
      where: { hubId_productId: { hubId, productId } },
      update: { availableQty: dto.availableQty },
      create: {
        hubId,
        productId,
        availableQty: dto.availableQty,
        reservedQty: 0,
      },
      include: this.inventoryRepo.inventoryInclude(),
    });
    return this.inventoryRepo.mapInventoryRow(row);
  }

  async updateEta(hubId: string, productId: string, dto: HubProductEtaDto) {
    await this.findOne(hubId, productId);
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { deliveryETA: dto.deliveryEta },
    });
    return product;
  }
}
