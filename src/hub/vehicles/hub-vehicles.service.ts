import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type {
  HubVehicleCreateDto,
  HubVehiclesQueryDto,
  HubVehicleUpdateDto,
} from '../dto/hub.dto';

@Injectable()
export class HubVehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(hubId: string, query: HubVehiclesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId, deletedAt: null };
    if (query.status) where['status'] = query.status;
    if (query.search) {
      where['registration'] = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registration: 'asc' },
        include: {
          driver: { select: { id: true, name: true, phone: true, availability: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async create(hubId: string, dto: HubVehicleCreateDto) {
    return this.prisma.vehicle.create({
      data: {
        hubId,
        registration: dto.registration.toUpperCase(),
        capacity: dto.capacity,
        vehicleType: (dto.vehicleType as any) ?? 'TRUCK',
      },
    });
  }

  async update(hubId: string, id: string, dto: HubVehicleUpdateDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, hubId, deletedAt: null },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.registration && { registration: dto.registration.toUpperCase() }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.vehicleType && { vehicleType: dto.vehicleType as any }),
        ...(dto.status && { status: dto.status as any }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { driver: true },
    });
  }

  async remove(hubId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, hubId, deletedAt: null },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    return this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: 'INACTIVE' },
    });
  }
}
