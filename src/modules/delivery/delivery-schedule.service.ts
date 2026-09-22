import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber } from '../../common/shopping/pricing.util';
import { NotificationService } from '../notification/notification.service';
import { DeliveryOperatingConfigService } from './delivery-operating-config.service';
import { DeliverySlotService } from './delivery-slot.service';
import { DELIVERY_SLOT_UNAVAILABLE } from './delivery-preference.constants';
import {
  addDateKeyDays,
  dateKeyToUtcDate,
  formatDateLabel,
  formatSlotLabel,
  utcToIst,
  validateSlotAgainstOperatingRules,
} from './delivery-slot.logic';

export type DeliveryScheduleBucket = 'today' | 'tomorrow' | 'scheduled' | 'all';

export type DeliveryScheduleQuery = {
  date?: string;
  bucket?: DeliveryScheduleBucket;
  status?: string;
  search?: string;
  vehicleType?: string;
  hubId?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class DeliveryScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operatingConfig: DeliveryOperatingConfigService,
    private readonly slotService: DeliverySlotService,
    private readonly notificationService: NotificationService,
  ) {}

  async getSchedule(query: DeliveryScheduleQuery) {
    const clock = utcToIst();
    const baseDate =
      query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
        ? query.date
        : clock.dateKey;
    const bucket = query.bucket ?? 'all';
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      orderStatus: { not: OrderStatus.CANCELLED },
    };

    if (query.hubId) where.hubId = query.hubId;
    if (query.vehicleType) {
      where.deliveryVehicleType = query.vehicleType as never;
    }
    if (query.status) {
      where.orderStatus = query.status as OrderStatus;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { fullName: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
      ];
    }

    if (bucket === 'today') {
      where.scheduledDate = dateKeyToUtcDate(baseDate);
    } else if (bucket === 'tomorrow') {
      where.scheduledDate = dateKeyToUtcDate(addDateKeyDays(baseDate, 1));
    } else if (bucket === 'scheduled') {
      where.deliveryPreferenceType = { in: ['TODAY', 'TOMORROW', 'SCHEDULED'] };
      where.scheduledDate = { gte: dateKeyToUtcDate(baseDate) };
    } else if (query.date) {
      where.scheduledDate = dateKeyToUtcDate(baseDate);
    }

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true },
          },
          hub: { select: { id: true, name: true, code: true } },
          assignedDriver: { select: { id: true, name: true, phone: true } },
          assignedVehicle: {
            select: { id: true, registration: true, vehicleType: true },
          },
          scheduledSlot: true,
        },
        orderBy: [
          { scheduledStartAt: 'asc' },
          { expectedDeliveryAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const operating = await this.operatingConfig.getConfig();
    const slots = orders.map((order) => this.mapScheduleItem(order));

    const grouped = new Map<
      string,
      {
        startMinutes: number | null;
        endMinutes: number | null;
        label: string;
        orders: typeof slots;
      }
    >();

    for (const item of slots) {
      const key =
        item.scheduledStartMinutes != null && item.scheduledEndMinutes != null
          ? `${item.scheduledStartMinutes}-${item.scheduledEndMinutes}`
          : 'asap';
      if (!grouped.has(key)) {
        grouped.set(key, {
          startMinutes: item.scheduledStartMinutes,
          endMinutes: item.scheduledEndMinutes,
          label:
            item.scheduledStartMinutes != null &&
            item.scheduledEndMinutes != null
              ? formatSlotLabel(
                  item.scheduledStartMinutes,
                  item.scheduledEndMinutes,
                )
              : 'ASAP / Unscheduled',
          orders: [],
        });
      }
      grouped.get(key)!.orders.push(item);
    }

    return {
      date: baseDate,
      dateLabel: formatDateLabel(baseDate),
      timezone: operating.timezone,
      operatingWindow: {
        startMinutes: operating.openMinutes,
        endMinutes: operating.closeMinutes,
        slotDurationMinutes: operating.slotDurationMinutes,
      },
      bucket,
      total,
      page,
      limit,
      groups: Array.from(grouped.values()),
      orders: slots,
    };
  }

  async requestReschedule(input: {
    orderId: string;
    hubId: string;
    slotId: string;
    reason?: string;
    actorId: string;
    actorName: string;
  }) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: input.orderId,
        hubId: input.hubId,
        deletedAt: null,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.orderStatus === OrderStatus.DELIVERED ||
      order.orderStatus === OrderStatus.CANCELLED ||
      order.orderStatus === OrderStatus.OUT_FOR_DELIVERY ||
      order.orderStatus === OrderStatus.DISPATCHED
    ) {
      throw new BadRequestException('This order can no longer be rescheduled.');
    }

    const slot = await this.prisma.deliverySlot.findFirst({
      where: { id: input.slotId, hubId: input.hubId, active: true },
    });
    if (!slot) {
      throw new BadRequestException({
        message: 'Selected delivery slot is not available.',
        code: DELIVERY_SLOT_UNAVAILABLE,
      });
    }

    const dateKey = slot.slotDate.toISOString().slice(0, 10);
    const operating = await this.operatingConfig.getConfig();
    const ruleError = validateSlotAgainstOperatingRules({
      dateKey,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      operating,
    });
    if (ruleError) {
      throw new BadRequestException({
        message: 'Proposed slot is outside delivery hours.',
        code: DELIVERY_SLOT_UNAVAILABLE,
      });
    }

    const counts = await this.slotService.loadReservationCounts([slot.id]);
    const reserved = Math.max(slot.reservedCapacity, counts.get(slot.id) ?? 0);
    if (slot.capacity - reserved <= 0) {
      throw new BadRequestException({
        message: 'That delivery slot is no longer available.',
        code: DELIVERY_SLOT_UNAVAILABLE,
      });
    }

    const proposedStartAt = new Date(
      Date.UTC(
        slot.slotDate.getUTCFullYear(),
        slot.slotDate.getUTCMonth(),
        slot.slotDate.getUTCDate(),
        0,
        slot.startMinutes - 330,
        0,
      ),
    );
    const proposedEndAt = new Date(
      Date.UTC(
        slot.slotDate.getUTCFullYear(),
        slot.slotDate.getUTCMonth(),
        slot.slotDate.getUTCDate(),
        0,
        slot.endMinutes - 330,
        0,
      ),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: OrderStatus.RESCHEDULE_REQUESTED,
          proposedSlotId: slot.id,
          proposedDate: slot.slotDate,
          proposedStartAt,
          proposedEndAt,
          rescheduleReason: input.reason?.slice(0, 500) ?? null,
          rescheduleRequestedAt: new Date(),
          rescheduleRequestedBy: input.actorName,
        },
      });
      await tx.orderTimeline.create({
        data: {
          orderId: order.id,
          status: OrderStatus.RESCHEDULE_REQUESTED,
          message: 'Reschedule requested',
          remarks: `Hub proposed ${formatDateLabel(dateKey)} ${formatSlotLabel(slot.startMinutes, slot.endMinutes)}${
            input.reason ? ` — ${input.reason}` : ''
          }`,
          updatedBy: input.actorName,
          updatedByRole: 'HUB',
        },
      });
      return row;
    });

    await this.notificationService.createForCustomer({
      customerId: order.customerId,
      type: NotificationType.DELIVERY,
      label: 'RESCHEDULE',
      title: 'Delivery schedule needs your attention',
      body: `Your order #${order.orderNumber} delivery schedule needs your attention. Hub proposed ${formatDateLabel(dateKey)}, ${formatSlotLabel(slot.startMinutes, slot.endMinutes)}.`,
      actionLabel: 'View Order',
      actionRoute: `/orders/view/${order.id}`,
      actionVariant: 'primary',
      priority: 10,
    });

    return {
      ...this.mapRescheduleView(updated),
      customerId: order.customerId,
      hubId: order.hubId,
    };
  }

  async acceptReschedule(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.orderStatus !== OrderStatus.RESCHEDULE_REQUESTED) {
      throw new BadRequestException('No reschedule request pending.');
    }
    if (!order.proposedSlotId || !order.proposedStartAt || !order.proposedEndAt) {
      throw new BadRequestException('Invalid reschedule proposal.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.slotService.confirmReservation({
        customerId,
        slotId: order.proposedSlotId!,
        orderId: order.id,
        db: tx,
      });

      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: OrderStatus.ACCEPTED_BY_HUB,
          scheduledSlotId: order.proposedSlotId,
          scheduledDate: order.proposedDate,
          scheduledStartAt: order.proposedStartAt,
          scheduledEndAt: order.proposedEndAt,
          expectedDeliveryAt: order.proposedEndAt,
          deliveryPreferenceType: 'SCHEDULED',
          proposedSlotId: null,
          proposedDate: null,
          proposedStartAt: null,
          proposedEndAt: null,
          rescheduleReason: null,
          rescheduleRequestedAt: null,
          rescheduleRequestedBy: null,
        },
      });

      await tx.orderTimeline.create({
        data: {
          orderId: order.id,
          status: OrderStatus.ACCEPTED_BY_HUB,
          message: 'Reschedule accepted',
          remarks: 'Customer accepted the proposed delivery schedule',
          updatedBy: 'CUSTOMER',
          updatedByRole: 'CUSTOMER',
        },
      });

      return row;
    });

    await this.notificationService.createForCustomer({
      customerId,
      type: NotificationType.DELIVERY,
      label: 'DELIVERY SCHEDULED',
      title: 'Delivery scheduled',
      body: `Your order #${order.orderNumber} is now scheduled for the new delivery time.`,
      actionLabel: 'View Order',
      actionRoute: `/orders/view/${order.id}`,
      actionVariant: 'outline',
      priority: 8,
    });

    return {
      ...this.mapRescheduleView(updated),
      customerId,
      hubId: order.hubId,
    };
  }

  async declineReschedule(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.orderStatus !== OrderStatus.RESCHEDULE_REQUESTED) {
      throw new BadRequestException('No reschedule request pending.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: OrderStatus.ACCEPTED_BY_HUB,
          proposedSlotId: null,
          proposedDate: null,
          proposedStartAt: null,
          proposedEndAt: null,
          rescheduleReason: null,
          rescheduleRequestedAt: null,
          rescheduleRequestedBy: null,
        },
      });
      await tx.orderTimeline.create({
        data: {
          orderId: order.id,
          status: OrderStatus.ACCEPTED_BY_HUB,
          message: 'Reschedule declined',
          remarks:
            'Customer declined the proposed schedule. Please choose another slot.',
          updatedBy: 'CUSTOMER',
          updatedByRole: 'CUSTOMER',
        },
      });
      return row;
    });

    return {
      ...this.mapRescheduleView(updated),
      chooseAnotherSlot: true,
      customerId,
      hubId: order.hubId,
    };
  }

  private mapScheduleItem(
    order: Prisma.OrderGetPayload<{
      include: {
        customer: { select: { id: true; fullName: true; phone: true } };
        hub: { select: { id: true; name: true; code: true } };
        assignedDriver: { select: { id: true; name: true; phone: true } };
        assignedVehicle: {
          select: { id: true; registration: true; vehicleType: true };
        };
        scheduledSlot: true;
      };
    }>,
  ) {
    const address =
      (order.deliveryAddress as Record<string, unknown> | null) ?? {};
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      grandTotal: decimalToNumber(order.grandTotal),
      deliveryPreferenceType: order.deliveryPreferenceType,
      scheduledDate: order.scheduledDate
        ? order.scheduledDate.toISOString().slice(0, 10)
        : null,
      scheduledStartAt: order.scheduledStartAt?.toISOString() ?? null,
      scheduledEndAt: order.scheduledEndAt?.toISOString() ?? null,
      scheduledStartMinutes: order.scheduledSlot?.startMinutes ?? null,
      scheduledEndMinutes: order.scheduledSlot?.endMinutes ?? null,
      scheduledSlotLabel:
        order.scheduledSlot != null
          ? formatSlotLabel(
              order.scheduledSlot.startMinutes,
              order.scheduledSlot.endMinutes,
            )
          : null,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      deliveryVehicleType: order.deliveryVehicleType,
      deliveryCustomerRemark: order.deliveryCustomerRemark,
      deliveryCallOnArrival: order.deliveryCallOnArrival,
      deliveryLeaveAtSecurity: order.deliveryLeaveAtSecurity,
      deliveryHeavyVehicleAccess: order.deliveryHeavyVehicleAccess,
      openAreaConfirmed: order.openAreaConfirmed,
      customer: order.customer,
      hub: order.hub,
      assignedDriver: order.assignedDriver,
      assignedVehicle: order.assignedVehicle,
      address: {
        siteName:
          (address.siteName as string) ?? (address.label as string) ?? null,
        line1: (address.line1 as string) ?? null,
        city: (address.city as string) ?? null,
        pincode: (address.pincode as string) ?? null,
      },
      proposedSlotId: order.proposedSlotId,
      proposedStartAt: order.proposedStartAt?.toISOString() ?? null,
      proposedEndAt: order.proposedEndAt?.toISOString() ?? null,
      rescheduleReason: order.rescheduleReason,
    };
  }

  private mapRescheduleView(order: {
    id: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    scheduledDate: Date | null;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    proposedSlotId: string | null;
    proposedDate: Date | null;
    proposedStartAt: Date | null;
    proposedEndAt: Date | null;
    rescheduleReason: string | null;
  }) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      scheduledDate: order.scheduledDate
        ? order.scheduledDate.toISOString().slice(0, 10)
        : null,
      scheduledStartAt: order.scheduledStartAt?.toISOString() ?? null,
      scheduledEndAt: order.scheduledEndAt?.toISOString() ?? null,
      proposedSlotId: order.proposedSlotId,
      proposedDate: order.proposedDate
        ? order.proposedDate.toISOString().slice(0, 10)
        : null,
      proposedStartAt: order.proposedStartAt?.toISOString() ?? null,
      proposedEndAt: order.proposedEndAt?.toISOString() ?? null,
      rescheduleReason: order.rescheduleReason,
    };
  }
}
