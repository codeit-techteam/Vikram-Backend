import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubLoadingCompleteDto,
  HubLoadingQueryDto,
  HubLoadingStartDto,
} from '../dto/hub.dto';

@Injectable()
export class HubLoadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
  ) {}

  async findAll(hubId: string, query: HubLoadingQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hubId };
    if (query.status) where['status'] = query.status;

    const [data, total] = await Promise.all([
      this.prisma.hubLoadingRecord.findMany({
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
              customer: { select: { fullName: true, phone: true } },
            },
          },
        },
      }),
      this.prisma.hubLoadingRecord.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(hubId: string, id: string) {
    const record = await this.prisma.hubLoadingRecord.findFirst({
      where: { id, hubId },
      include: {
        order: {
          include: {
            customer: { select: { fullName: true, phone: true } },
            items: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Loading record not found');
    return record;
  }

  async start(hubId: string, dto: HubLoadingStartDto, startedBy: string) {
    await this.orderRepo.findHubOrder(dto.orderId, hubId);

    return this.prisma.hubLoadingRecord.upsert({
      where: { orderId: dto.orderId },
      update: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy,
        notes: dto.notes,
      },
      create: {
        orderId: dto.orderId,
        hubId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy,
        notes: dto.notes,
      },
    });
  }

  async complete(
    hubId: string,
    dto: HubLoadingCompleteDto,
    completedBy: string,
  ) {
    const record = await this.prisma.hubLoadingRecord.findFirst({
      where: { orderId: dto.orderId, hubId },
    });
    if (!record) throw new NotFoundException('Loading record not found');

    const loadingTimeMinutes = record.startedAt
      ? Math.round((Date.now() - record.startedAt.getTime()) / 60000)
      : null;

    return this.prisma.hubLoadingRecord.update({
      where: { id: record.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy,
        photos: dto.photos ?? [],
        notes: dto.notes ?? record.notes,
        ...(loadingTimeMinutes !== null && {
          notes:
            `${dto.notes ?? record.notes ?? ''}\nLoading time: ${loadingTimeMinutes} min`.trim(),
        }),
      },
    });
  }
}
