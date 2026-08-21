import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeliverySlotReservationStatus,
  Prisma,
  VehicleStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { DeliveryVehicleType } from './delivery-pricing.constants';
import {
  DEFAULT_SLOT_CAPACITY,
  FLEET_TYPES_FOR_DELIVERY_VEHICLE,
  RMC_SLOT_CAPACITY,
  SLOT_HOLD_MINUTES,
} from './delivery-preference.constants';
import {
  dateKeyToUtcDate,
  isRmcOrder,
  resolveSlotCapacity,
} from './delivery-slot.logic';
import type { GeneratedSlotWindow } from './delivery-slot.logic';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class DeliverySlotService {
  constructor(private readonly prisma: PrismaService) {}

  async expireStaleReservations(db: DbClient = this.prisma): Promise<void> {
    const now = new Date();
    const stale = await db.deliverySlotReservation.findMany({
      where: {
        status: DeliverySlotReservationStatus.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true, slotId: true },
    });
    if (stale.length === 0) return;

    await db.deliverySlotReservation.updateMany({
      where: { id: { in: stale.map((row) => row.id) } },
      data: { status: DeliverySlotReservationStatus.EXPIRED },
    });

    const bySlot = new Map<string, number>();
    for (const row of stale) {
      bySlot.set(row.slotId, (bySlot.get(row.slotId) ?? 0) + 1);
    }
    for (const [slotId, count] of bySlot) {
      await db.deliverySlot.update({
        where: { id: slotId },
        data: { reservedCapacity: { decrement: count } },
      });
      await db.deliverySlot.updateMany({
        where: { id: slotId, reservedCapacity: { lt: 0 } },
        data: { reservedCapacity: 0 },
      });
    }
  }

  async countHubVehicleCapacity(input: {
    hubId: string;
    vehicleType?: DeliveryVehicleType | string | null;
    logisticsType?: string | null;
  }): Promise<number> {
    const isRmc = isRmcOrder({
      logisticsType: input.logisticsType,
      vehicleType: input.vehicleType,
    });
    const fleetTypes = input.vehicleType
      ? FLEET_TYPES_FOR_DELIVERY_VEHICLE[
          input.vehicleType as DeliveryVehicleType
        ]
      : undefined;
    const count = await this.prisma.vehicle.count({
      where: {
        hubId: input.hubId,
        isActive: true,
        status: VehicleStatus.AVAILABLE,
        ...(fleetTypes ? { vehicleType: { in: [...fleetTypes] } } : {}),
      },
    });
    return resolveSlotCapacity({
      isRmc,
      vehicleCapacity: count > 0 ? count : null,
    });
  }

  async upsertSlot(input: {
    hubId: string;
    window: GeneratedSlotWindow;
    capacity: number;
    vehicleType?: DeliveryVehicleType | string | null;
    logisticsType?: string | null;
    db?: DbClient;
  }) {
    const db = input.db ?? this.prisma;
    const slotDate = dateKeyToUtcDate(input.window.dateKey);
    const vehicleTypes = input.vehicleType
      ? [input.vehicleType as DeliveryVehicleType]
      : [];
    return db.deliverySlot.upsert({
      where: {
        hubId_slotDate_startMinutes_endMinutes: {
          hubId: input.hubId,
          slotDate,
          startMinutes: input.window.startMinutes,
          endMinutes: input.window.endMinutes,
        },
      },
      create: {
        hubId: input.hubId,
        slotDate,
        startMinutes: input.window.startMinutes,
        endMinutes: input.window.endMinutes,
        cutoffMinutes: input.window.cutoffMinutes,
        capacity: input.capacity,
        reservedCapacity: 0,
        vehicleTypes,
        logisticsType: input.logisticsType ?? null,
        active: true,
      },
      update: {
        cutoffMinutes: input.window.cutoffMinutes,
        active: true,
        logisticsType: input.logisticsType ?? undefined,
      },
    });
  }

  async loadReservationCounts(
    slotIds: string[],
    db: DbClient = this.prisma,
  ): Promise<Map<string, number>> {
    if (slotIds.length === 0) return new Map();
    const now = new Date();
    const grouped = await db.deliverySlotReservation.groupBy({
      by: ['slotId'],
      where: {
        slotId: { in: slotIds },
        OR: [
          { status: DeliverySlotReservationStatus.CONFIRMED },
          {
            status: DeliverySlotReservationStatus.PENDING,
            expiresAt: { gt: now },
          },
        ],
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.slotId, row._count._all]));
  }

  async holdSlot(input: { customerId: string; slotId: string; db?: DbClient }) {
    const db = input.db ?? this.prisma;
    await this.expireStaleReservations(db);
    const slot = await db.deliverySlot.findUnique({
      where: { id: input.slotId },
    });
    if (!slot || !slot.active) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }
    const existing = await db.deliverySlotReservation.findFirst({
      where: {
        slotId: input.slotId,
        customerId: input.customerId,
        status: {
          in: [
            DeliverySlotReservationStatus.PENDING,
            DeliverySlotReservationStatus.CONFIRMED,
          ],
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existing?.status === DeliverySlotReservationStatus.PENDING) {
      const expiresAt = new Date(Date.now() + SLOT_HOLD_MINUTES * 60 * 1000);
      return db.deliverySlotReservation.update({
        where: { id: existing.id },
        data: { expiresAt },
      });
    }
    if (existing?.status === DeliverySlotReservationStatus.CONFIRMED) {
      return existing;
    }

    const reserved = await db.deliverySlotReservation.count({
      where: {
        slotId: input.slotId,
        OR: [
          { status: DeliverySlotReservationStatus.CONFIRMED },
          {
            status: DeliverySlotReservationStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
        ],
      },
    });
    if (reserved >= slot.capacity) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }

    const updated = await db.deliverySlot.updateMany({
      where: {
        id: slot.id,
        reservedCapacity: { lt: slot.capacity },
        active: true,
      },
      data: { reservedCapacity: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }

    return db.deliverySlotReservation.create({
      data: {
        slotId: slot.id,
        customerId: input.customerId,
        status: DeliverySlotReservationStatus.PENDING,
        expiresAt: new Date(Date.now() + SLOT_HOLD_MINUTES * 60 * 1000),
      },
    });
  }

  async confirmReservation(input: {
    customerId: string;
    slotId: string;
    orderId: string;
    db: Prisma.TransactionClient;
  }) {
    await this.expireStaleReservations(input.db);
    const slot = await input.db.deliverySlot.findUnique({
      where: { id: input.slotId },
    });
    if (!slot || !slot.active) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }

    const pending = await input.db.deliverySlotReservation.findFirst({
      where: {
        slotId: input.slotId,
        customerId: input.customerId,
        status: DeliverySlotReservationStatus.PENDING,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (pending) {
      return input.db.deliverySlotReservation.update({
        where: { id: pending.id },
        data: {
          status: DeliverySlotReservationStatus.CONFIRMED,
          orderId: input.orderId,
          expiresAt: null,
        },
      });
    }

    const reserved = await input.db.deliverySlotReservation.count({
      where: {
        slotId: input.slotId,
        OR: [
          { status: DeliverySlotReservationStatus.CONFIRMED },
          {
            status: DeliverySlotReservationStatus.PENDING,
            expiresAt: { gt: new Date() },
          },
        ],
      },
    });
    if (reserved >= slot.capacity) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }

    const updated = await input.db.deliverySlot.updateMany({
      where: {
        id: slot.id,
        reservedCapacity: { lt: slot.capacity },
        active: true,
      },
      data: { reservedCapacity: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new BadRequestException(
        'Your selected delivery slot is no longer available.',
      );
    }

    return input.db.deliverySlotReservation.create({
      data: {
        slotId: slot.id,
        customerId: input.customerId,
        orderId: input.orderId,
        status: DeliverySlotReservationStatus.CONFIRMED,
        expiresAt: null,
      },
    });
  }

  async releaseOrderReservation(
    orderId: string,
    db: DbClient = this.prisma,
  ): Promise<void> {
    const reservation = await db.deliverySlotReservation.findFirst({
      where: {
        orderId,
        status: {
          in: [
            DeliverySlotReservationStatus.PENDING,
            DeliverySlotReservationStatus.CONFIRMED,
          ],
        },
      },
    });
    if (!reservation) return;
    await db.deliverySlotReservation.update({
      where: { id: reservation.id },
      data: { status: DeliverySlotReservationStatus.RELEASED },
    });
    await db.deliverySlot.update({
      where: { id: reservation.slotId },
      data: { reservedCapacity: { decrement: 1 } },
    });
    await db.deliverySlot.updateMany({
      where: { id: reservation.slotId, reservedCapacity: { lt: 0 } },
      data: { reservedCapacity: 0 },
    });
  }

  defaultCapacity(isRmc: boolean): number {
    return isRmc ? RMC_SLOT_CAPACITY : DEFAULT_SLOT_CAPACITY;
  }
}
