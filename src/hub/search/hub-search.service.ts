import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubInventoryRepository } from '../repositories/hub-inventory.repository';
import type { HubSearchQueryDto } from '../dto/hub.dto';

@Injectable()
export class HubSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: HubInventoryRepository,
  ) {}

  async search(hubId: string, query: HubSearchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const q = query.q.trim();

    if (!q) {
      throw new BadRequestException('Search query is required');
    }

    switch (query.type) {
      case 'orders':
        return this.searchOrders(hubId, q, page, limit, skip);
      case 'products':
        return this.searchProducts(hubId, q, page, limit, skip);
      case 'drivers':
        return this.searchDrivers(hubId, q, page, limit, skip);
      case 'vehicles':
        return this.searchVehicles(hubId, q, page, limit, skip);
      case 'inventory':
        return this.searchInventory(hubId, q, page, limit, skip);
      default:
        throw new BadRequestException('Invalid search type');
    }
  }

  private paginate<T>(data: T[], page: number, limit: number, skip: number) {
    const total = data.length;
    return {
      data: data.slice(skip, skip + limit),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchOrders(hubId: string, q: string, page: number, limit: number, skip: number) {
    const where = {
      hubId,
      deletedAt: null,
      OR: [
        { orderNumber: { contains: q, mode: 'insensitive' as const } },
        { customer: { fullName: { contains: q, mode: 'insensitive' as const } } },
        { customer: { phone: { contains: q } } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isEmergency: 'desc' }, { createdAt: 'desc' }],
        include: { customer: { select: { fullName: true, phone: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async searchProducts(hubId: string, q: string, page: number, limit: number, skip: number) {
    const where = {
      hubId,
      product: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { sku: { contains: q, mode: 'insensitive' as const } },
        ],
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.hubInventory.findMany({
        where,
        skip,
        take: limit,
        include: this.inventoryRepo.inventoryInclude(),
      }),
      this.prisma.hubInventory.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.inventoryRepo.mapInventoryRow(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async searchDrivers(hubId: string, q: string, page: number, limit: number, skip: number) {
    const where = {
      hubId,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { phone: { contains: q } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.driver.findMany({ where, skip, take: limit, include: { vehicle: true } }),
      this.prisma.driver.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async searchVehicles(hubId: string, q: string, page: number, limit: number, skip: number) {
    const where = {
      hubId,
      deletedAt: null,
      registration: { contains: q, mode: 'insensitive' as const },
    };

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, skip, take: limit, include: { driver: true } }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async searchInventory(hubId: string, q: string, page: number, limit: number, skip: number) {
    return this.searchProducts(hubId, q, page, limit, skip);
  }
}
