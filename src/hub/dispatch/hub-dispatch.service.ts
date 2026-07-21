import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { generateDispatchNo } from '../common/hub-date.util';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubDispatchCreateDto,
  HubDispatchQueryDto,
  HubDispatchUpdateDto,
} from '../dto/hub.dto';

@Injectable()
export class HubDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
  ) {}

  async findAll(hubId: string, query: HubDispatchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId };
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.hubDispatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStatus: true,
              deliveryAddress: true,
            },
          },
          driver: true,
          vehicle: true,
        },
      }),
      this.prisma.hubDispatch.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async create(hubId: string, dto: HubDispatchCreateDto) {
    await this.orderRepo.findHubOrder(dto.orderId, hubId);

    return this.prisma.hubDispatch.upsert({
      where: { orderId: dto.orderId },
      update: {
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        remarks: dto.remarks,
        status: 'PENDING',
      },
      create: {
        orderId: dto.orderId,
        hubId,
        dispatchNo: generateDispatchNo(),
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        remarks: dto.remarks,
        status: 'PENDING',
      },
      include: { driver: true, vehicle: true, order: true },
    });
  }

  async update(hubId: string, id: string, dto: HubDispatchUpdateDto) {
    const dispatch = await this.prisma.hubDispatch.findFirst({
      where: { id, hubId },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    return this.prisma.hubDispatch.update({
      where: { id },
      data: {
        ...(dto.driverId && { driverId: dto.driverId }),
        ...(dto.vehicleId && { vehicleId: dto.vehicleId }),
        ...(dto.remarks !== undefined && { remarks: dto.remarks }),
      },
      include: { driver: true, vehicle: true, order: true },
    });
  }

  async complete(hubId: string, id: string) {
    const dispatch = await this.prisma.hubDispatch.findFirst({
      where: { id, hubId },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    return this.prisma.hubDispatch.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        dispatchedAt: dispatch.dispatchedAt ?? new Date(),
      },
      include: { driver: true, vehicle: true, order: true },
    });
  }
}
