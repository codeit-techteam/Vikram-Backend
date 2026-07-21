import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { OrderStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { HUB_ORDER_FILTER_MAP } from '../constants/hub.constants';
import { HubOrderRepository } from '../repositories/hub-order.repository';
import type {
  HubAssignDriverDto,
  HubAssignLoaderDto,
  HubAssignTeamDto,
  HubAssignVehicleDto,
  HubCancelOrderDto,
  HubOrderActionDto,
  HubOrderQueryDto,
  HubPodDto,
  HubRejectOrderDto,
  HubTimelineEntryDto,
} from '../dto/hub.dto';

@Injectable()
export class HubOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: HubOrderRepository,
  ) {}

  async findAll(hubId: string, query: HubOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = { ...this.orderRepo.hubScope(hubId) };

    if (query.status) {
      where.orderStatus = query.status;
    } else if (query.filter) {
      if (query.filter === 'emergency') {
        where.isEmergency = true;
      } else if (query.filter === 'bulk') {
        where.bulkOrder = true;
      } else if (query.filter === 'membership') {
        where.membershipDiscount = { gt: 0 };
      } else if (HUB_ORDER_FILTER_MAP[query.filter]) {
        where.orderStatus = { in: HUB_ORDER_FILTER_MAP[query.filter] };
      }
    }

    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search } } },
      ];
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
      { isEmergency: 'desc' },
      { priorityOrder: 'desc' },
      { createdAt: 'desc' },
    ];

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: { select: { id: true, fullName: true, phone: true } },
          _count: { select: { items: true } },
          assignedDriver: { select: { id: true, name: true, phone: true } },
          assignedVehicle: { select: { id: true, registration: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(hubId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...this.orderRepo.hubScope(hubId) },
      include: this.orderRepo.orderDetailInclude(),
    });

    if (!order) {
      throw new BadRequestException('Order not found for this hub');
    }

    return {
      ...order,
      loadingCharges: order.loadingCharges,
      unloadingCharges: order.unloadingCharges,
      walletUsed: order.walletAmountUsed,
      membershipDiscount: order.membershipDiscount,
      loyaltyPoints: order.loyaltyPointsUsed,
      priorityOrder: order.priorityOrder,
      emergency: order.isEmergency,
      bulkOrder: order.bulkOrder,
      driver: order.assignedDriver,
      vehicle: order.assignedVehicle,
      loader: order.assignedLoader,
      timeline: order.timeline,
    };
  }

  private async transitionOrder(
    hubId: string,
    orderId: string,
    nextStatus: OrderStatus,
    updatedBy: string,
    extra?: Prisma.OrderUpdateInput,
    remarks?: string,
  ) {
    await this.orderRepo.findHubOrder(orderId, hubId);

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { orderStatus: nextStatus, ...extra },
      }),
      this.prisma.orderTimeline.create({
        data: { orderId, status: nextStatus, updatedBy, remarks },
      }),
    ]);

    return updated;
  }

  async accept(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);
    const allowed: OrderStatus[] = ['HUB_ASSIGNED', 'CONFIRMED', 'PENDING'];
    if (!allowed.includes(order.orderStatus)) {
      throw new BadRequestException('Order cannot be accepted in current status');
    }

    return this.transitionOrder(
      hubId,
      orderId,
      'PROCESSING',
      updatedBy,
      undefined,
      dto.remarks ?? 'Order accepted by hub',
    );
  }

  async reject(hubId: string, orderId: string, dto: HubRejectOrderDto, updatedBy: string) {
    return this.transitionOrder(
      hubId,
      orderId,
      'CANCELLED',
      updatedBy,
      {
        cancelReason: dto.reason,
        cancelledAt: new Date(),
        hubRejectReason: dto.reason,
        hubRejectedAt: new Date(),
      },
      dto.reason,
    );
  }

  async markReady(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    return this.transitionOrder(
      hubId,
      orderId,
      'READY_FOR_DISPATCH',
      updatedBy,
      { loadingCompletedAt: new Date() },
      dto.remarks ?? 'Order ready for dispatch',
    );
  }

  async markLoading(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    await this.prisma.hubLoadingRecord.upsert({
      where: { orderId },
      update: { status: 'IN_PROGRESS', startedAt: new Date(), startedBy: updatedBy },
      create: {
        orderId,
        hubId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        startedBy: updatedBy,
        notes: dto.remarks,
      },
    });

    return this.transitionOrder(
      hubId,
      orderId,
      'PACKED',
      updatedBy,
      { loadingStartedAt: order.loadingStartedAt ?? new Date() },
      dto.remarks ?? 'Loading started',
    );
  }

  async dispatch(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    await this.prisma.hubDispatch.upsert({
      where: { orderId },
      update: {
        status: 'IN_PROGRESS',
        dispatchedAt: new Date(),
        driverId: order.assignedDriverId ?? undefined,
        vehicleId: order.assignedVehicleId ?? undefined,
      },
      create: {
        orderId,
        hubId,
        dispatchNo: `DSP-${Date.now().toString().slice(-8)}`,
        status: 'IN_PROGRESS',
        dispatchedAt: new Date(),
        driverId: order.assignedDriverId,
        vehicleId: order.assignedVehicleId,
        remarks: dto.remarks,
      },
    });

    if (order.assignedDriverId) {
      await this.prisma.driver.update({
        where: { id: order.assignedDriverId },
        data: { availability: 'ON_DELIVERY' },
      });
    }
    if (order.assignedVehicleId) {
      await this.prisma.vehicle.update({
        where: { id: order.assignedVehicleId },
        data: { status: 'IN_USE' },
      });
    }

    return this.transitionOrder(
      hubId,
      orderId,
      'DISPATCHED',
      updatedBy,
      { dispatchedAt: new Date() },
      dto.remarks ?? 'Order dispatched',
    );
  }

  async deliver(hubId: string, orderId: string, dto: HubOrderActionDto, updatedBy: string) {
    const order = await this.orderRepo.findHubOrder(orderId, hubId);

    if (order.assignedDriverId) {
      await this.prisma.driver.update({
        where: { id: order.assignedDriverId },
        data: { availability: 'AVAILABLE' },
      });
    }
    if (order.assignedVehicleId) {
      await this.prisma.vehicle.update({
        where: { id: order.assignedVehicleId },
        data: { status: 'AVAILABLE' },
      });
    }

    await this.prisma.hubDispatch.updateMany({
      where: { orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    return this.transitionOrder(
      hubId,
      orderId,
      'DELIVERED',
      updatedBy,
      { deliveredAt: new Date() },
      dto.remarks ?? 'Order delivered',
    );
  }

  async cancel(hubId: string, orderId: string, dto: HubCancelOrderDto, updatedBy: string) {
    return this.transitionOrder(
      hubId,
      orderId,
      'CANCELLED',
      updatedBy,
      { cancelReason: dto.reason, cancelledAt: new Date() },
      dto.reason,
    );
  }

  async getTimeline(hubId: string, orderId: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    return this.prisma.orderTimeline.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addTimeline(
    hubId: string,
    orderId: string,
    dto: HubTimelineEntryDto,
    updatedBy: string,
  ) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    return this.orderRepo.addTimeline(orderId, dto.status, updatedBy, dto.remarks);
  }

  async assignDriver(hubId: string, orderId: string, dto: HubAssignDriverDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, hubId, isActive: true, deletedAt: null },
    });
    if (!driver) throw new BadRequestException('Driver not found at this hub');

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedDriverId: dto.driverId },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      `Driver assigned: ${driver.name}`,
    );

    return order;
  }

  async assignVehicle(hubId: string, orderId: string, dto: HubAssignVehicleDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, hubId, isActive: true, deletedAt: null },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found at this hub');

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedVehicleId: dto.vehicleId },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      `Vehicle assigned: ${vehicle.registration}`,
    );

    return order;
  }

  async assignLoader(hubId: string, orderId: string, dto: HubAssignLoaderDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);
    const loader = await this.prisma.hubUser.findFirst({
      where: { id: dto.loaderId, hubId, isActive: true, deletedAt: null },
    });
    if (!loader) throw new BadRequestException('Loader not found at this hub');

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedLoaderId: dto.loaderId },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      `Loader assigned: ${loader.fullName}`,
    );

    return order;
  }

  async assignTeam(hubId: string, orderId: string, dto: HubAssignTeamDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...(dto.driverId && { assignedDriverId: dto.driverId }),
        ...(dto.vehicleId && { assignedVehicleId: dto.vehicleId }),
        ...(dto.loaderId && { assignedLoaderId: dto.loaderId }),
      },
    });

    await this.orderRepo.addTimeline(
      orderId,
      order.orderStatus,
      updatedBy,
      'Team assigned to order',
    );

    return order;
  }

  async submitPod(hubId: string, orderId: string, dto: HubPodDto, updatedBy: string) {
    await this.orderRepo.findHubOrder(orderId, hubId);

    const pod = await this.prisma.proofOfDelivery.upsert({
      where: { orderId },
      update: {
        deliveryPhotos: dto.deliveryPhotos ?? [],
        customerSignature: dto.customerSignature,
        otpVerified: dto.otpVerified ?? false,
        remarks: dto.remarks,
        deliveredAt: new Date(),
        deliveredBy: updatedBy,
      },
      create: {
        orderId,
        deliveryPhotos: dto.deliveryPhotos ?? [],
        customerSignature: dto.customerSignature,
        otpVerified: dto.otpVerified ?? false,
        remarks: dto.remarks,
        deliveredAt: new Date(),
        deliveredBy: updatedBy,
      },
    });

    await this.deliver(hubId, orderId, { remarks: dto.remarks }, updatedBy);
    return pod;
  }
}
