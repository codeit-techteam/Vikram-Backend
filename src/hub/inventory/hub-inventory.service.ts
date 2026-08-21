import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubInventoryRepository } from '../repositories/hub-inventory.repository';
import type {
  HubInventoryAdjustDto,
  HubInventoryQueryDto,
  HubInventoryReceiveDto,
  HubInventoryTransferDto,
  HubInventoryUpdateDto,
} from '../dto/hub.dto';

@Injectable()
export class HubInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async findAll(hubId: string, query: HubInventoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId };
    const productWhere: Record<string, unknown> = {};

    if (query.search) {
      productWhere.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.categorySlug && query.categorySlug !== 'all') {
      productWhere.category = { slug: query.categorySlug };
    }

    if (Object.keys(productWhere).length > 0) {
      where['product'] = productWhere;
    }

    const rows = await this.prisma.hubInventory.findMany({
      where,
      include: this.inventoryRepo.inventoryInclude(),
      orderBy: { updatedAt: 'desc' },
    });

    let mapped = rows.map((row) => this.inventoryRepo.mapInventoryRow(row));
    if (query.lowStockOnly) {
      mapped = mapped.filter((row) => row.lowStock);
    }

    const total = mapped.length;
    const data = mapped.slice(skip, skip + limit);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(hubId: string, id: string) {
    const row = await this.prisma.hubInventory.findFirst({
      where: { id, hubId },
      include: this.inventoryRepo.inventoryInclude(),
    });
    if (!row) throw new NotFoundException('Inventory item not found');
    return this.inventoryRepo.mapInventoryRow(row);
  }

  async update(hubId: string, id: string, dto: HubInventoryUpdateDto) {
    await this.findOne(hubId, id);
    const updated = await this.prisma.hubInventory.update({
      where: { id },
      data: {
        ...(dto.availableQty !== undefined && {
          availableQty: dto.availableQty,
        }),
        ...(dto.lowStockThreshold !== undefined && {
          lowStockThreshold: dto.lowStockThreshold,
        }),
      },
      include: this.inventoryRepo.inventoryInclude(),
    });
    return this.inventoryRepo.mapInventoryRow(updated);
  }

  async receive(hubId: string, dto: HubInventoryReceiveDto, updatedBy: string) {
    const row = await this.prisma.hubInventory.upsert({
      where: { hubId_productId: { hubId, productId: dto.productId } },
      update: { availableQty: { increment: dto.quantity } },
      create: {
        hubId,
        productId: dto.productId,
        availableQty: dto.quantity,
        reservedQty: 0,
      },
      include: this.inventoryRepo.inventoryInclude(),
    });

    await this.prisma.hubNotification.create({
      data: {
        hubId,
        type: 'INVENTORY',
        title: 'Stock Received',
        body: `Received ${dto.quantity} units of ${row.product.name}. ${dto.remarks ?? ''}`.trim(),
      },
    });

    return this.inventoryRepo.mapInventoryRow(row);
  }

  async adjust(hubId: string, dto: HubInventoryAdjustDto, updatedBy: string) {
    const existing = await this.prisma.hubInventory.findUnique({
      where: { hubId_productId: { hubId, productId: dto.productId } },
    });

    if (!existing) throw new NotFoundException('Inventory record not found');

    const newQty = existing.availableQty + dto.adjustment;
    if (newQty < 0) {
      throw new BadRequestException(
        'Adjustment would result in negative stock',
      );
    }

    const updated = await this.prisma.hubInventory.update({
      where: { id: existing.id },
      data: { availableQty: newQty },
      include: this.inventoryRepo.inventoryInclude(),
    });

    return this.inventoryRepo.mapInventoryRow(updated);
  }

  async transfer(
    hubId: string,
    dto: HubInventoryTransferDto,
    transferredBy: string,
  ) {
    if (hubId === dto.toHubId) {
      throw new BadRequestException('Cannot transfer to the same hub');
    }

    const source = await this.prisma.hubInventory.findUnique({
      where: { hubId_productId: { hubId, productId: dto.productId } },
    });

    if (!source || source.availableQty < dto.quantity) {
      throw new BadRequestException(
        'Insufficient available stock for transfer',
      );
    }

    const [transfer] = await this.prisma.$transaction([
      this.prisma.inventoryTransfer.create({
        data: {
          fromHubId: hubId,
          toHubId: dto.toHubId,
          productId: dto.productId,
          quantity: dto.quantity,
          remarks: dto.remarks,
          transferredBy,
          status: 'IN_TRANSIT',
        },
      }),
      this.prisma.hubInventory.update({
        where: { id: source.id },
        data: { availableQty: { decrement: dto.quantity } },
      }),
      this.prisma.hubInventory.upsert({
        where: {
          hubId_productId: { hubId: dto.toHubId, productId: dto.productId },
        },
        update: { availableQty: { increment: dto.quantity } },
        create: {
          hubId: dto.toHubId,
          productId: dto.productId,
          availableQty: dto.quantity,
          reservedQty: 0,
        },
      }),
    ]);

    await this.prisma.inventoryTransfer.update({
      where: { id: transfer.id },
      data: { status: 'RECEIVED' },
    });

    return transfer;
  }
}
