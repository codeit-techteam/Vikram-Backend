import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CreateEmergencyOrderDto,
  EmergencyOrderResponseDto,
} from './dto/emergency-order.dto';

@Injectable()
export class EmergencyOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createEmergencyRequest(
    customerId: string,
    dto: CreateEmergencyOrderDto,
  ): Promise<EmergencyOrderResponseDto> {
    const requiredWithin = new Date(dto.requiredWithin);
    if (Number.isNaN(requiredWithin.getTime())) {
      throw new BadRequestException('Invalid requiredWithin date');
    }

    if (requiredWithin <= new Date()) {
      throw new BadRequestException('requiredWithin must be in the future');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        customerId,
        deletedAt: null,
        orderStatus: {
          notIn: [OrderStatus.CANCELLED, OrderStatus.DELIVERED],
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Order not found or not eligible for emergency delivery',
      );
    }

    const existing = await this.prisma.emergencyOrder.findUnique({
      where: { orderId: dto.orderId },
    });

    if (existing) {
      throw new ConflictException(
        'Emergency delivery request already exists for this order',
      );
    }

    const priorityLevel = dto.priorityLevel ?? 'HIGH';

    const [emergency] = await this.prisma.$transaction([
      this.prisma.emergencyOrder.create({
        data: {
          customerId,
          orderId: dto.orderId,
          requiredWithin,
          priorityLevel,
        },
      }),
      this.prisma.order.update({
        where: { id: dto.orderId },
        data: {
          isEmergency: true,
          priorityOrder: true,
        },
      }),
    ]);

    return this.mapEmergency(emergency);
  }

  private mapEmergency(item: {
    id: string;
    customerId: string;
    orderId: string;
    requiredWithin: Date;
    priorityLevel: EmergencyOrderResponseDto['priorityLevel'];
    status: EmergencyOrderResponseDto['status'];
    createdAt: Date;
  }): EmergencyOrderResponseDto {
    return {
      id: item.id,
      customerId: item.customerId,
      orderId: item.orderId,
      requiredWithin: item.requiredWithin.toISOString(),
      priorityLevel: item.priorityLevel,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
