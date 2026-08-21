import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubUnloadingCompleteDto,
  HubUnloadingStartDto,
} from '../dto/hub.dto';

@Injectable()
export class HubUnloadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
  ) {}

  async findAll(hubId: string) {
    return this.prisma.hubUnloadingRecord.findMany({
      where: { hubId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: { id: true, orderNumber: true, orderStatus: true },
        },
      },
    });
  }

  async start(hubId: string, dto: HubUnloadingStartDto, startedBy: string) {
    await this.orderRepo.findHubOrder(dto.orderId, hubId);

    return this.prisma.hubUnloadingRecord.upsert({
      where: { orderId: dto.orderId },
      update: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy,
        remarks: dto.remarks,
      },
      create: {
        orderId: dto.orderId,
        hubId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy,
        remarks: dto.remarks,
      },
    });
  }

  async complete(
    hubId: string,
    dto: HubUnloadingCompleteDto,
    completedBy: string,
  ) {
    const record = await this.prisma.hubUnloadingRecord.findFirst({
      where: { orderId: dto.orderId, hubId },
    });
    if (!record) throw new NotFoundException('Unloading record not found');

    return this.prisma.hubUnloadingRecord.update({
      where: { id: record.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy,
        proofPhotos: dto.proofPhotos ?? [],
        signature: dto.signature,
        remarks: dto.remarks ?? record.remarks,
      },
    });
  }
}
