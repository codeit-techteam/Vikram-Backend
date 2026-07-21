import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { OrderStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedHubUser } from '../auth/hub-jwt.strategy';

@Injectable()
export class HubOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  hubScope(hubId: string): Prisma.OrderWhereInput {
    return { hubId, deletedAt: null };
  }

  async findHubOrder(orderId: string, hubId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...this.hubScope(hubId) },
    });
    if (!order) {
      throw new NotFoundException('Order not found for this hub');
    }
    return order;
  }

  assertHubAccess(user: AuthenticatedHubUser, hubId: string): void {
    if (user.hubId !== hubId) {
      throw new ForbiddenException('Access denied for this hub');
    }
  }

  async addTimeline(
    orderId: string,
    status: OrderStatus,
    updatedBy: string,
    remarks?: string,
  ) {
    return this.prisma.orderTimeline.create({
      data: { orderId, status, updatedBy, remarks },
    });
  }

  orderDetailInclude() {
    return {
      customer: {
        select: {
          id: true,
          phone: true,
          fullName: true,
          email: true,
          profile: true,
          activeMembership: { include: { plan: true } },
        },
      },
      address: true,
      hub: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
      timeline: { orderBy: { createdAt: 'asc' as const } },
      assignedDriver: true,
      assignedVehicle: true,
      assignedLoader: {
        select: { id: true, fullName: true, employeeId: true, role: true },
      },
      loadingRecord: true,
      unloadingRecord: true,
      dispatch: true,
      proofOfDelivery: true,
      emergencyOrder: true,
    };
  }
}
