import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { HubDriverCreateDto, HubDriversQueryDto, HubDriverUpdateDto } from '../dto/hub.dto';

@Injectable()
export class HubDriversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(hubId: string, query: HubDriversQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId, deletedAt: null };
    if (query.availability) where['availability'] = query.availability;
    if (query.search) {
      where['OR'] = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          vehicle: { select: { id: true, registration: true, vehicleType: true } },
          _count: {
            select: {
              orders: {
                where: { orderStatus: { in: ['DISPATCHED', 'READY_FOR_DISPATCH'] } },
              },
            },
          },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    const data = drivers.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      vehicle: d.vehicle,
      availability: d.availability,
      isActive: d.isActive,
      currentOrders: d._count.orders,
    }));

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async create(hubId: string, dto: HubDriverCreateDto) {
    return this.prisma.driver.create({
      data: {
        hubId,
        name: dto.name,
        phone: dto.phone,
        vehicleId: dto.vehicleId,
      },
      include: { vehicle: true },
    });
  }

  async update(hubId: string, id: string, dto: HubDriverUpdateDto) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, hubId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.driver.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.vehicleId !== undefined && { vehicleId: dto.vehicleId }),
        ...(dto.availability && { availability: dto.availability as any }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { vehicle: true },
    });
  }

  async remove(hubId: string, id: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, hubId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.driver.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, availability: 'INACTIVE' },
    });
  }
}
