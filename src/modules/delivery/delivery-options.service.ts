import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber } from '../../common/shopping/pricing.util';
import { CartService } from '../cart/cart.service';
import { CoverageService } from '../coverage/coverage.service';
import { DeliveryService } from './delivery.service';
import { DELIVERY_VEHICLE_DISPLAY_NAMES } from './delivery-pricing.constants';
import type { DeliveryVehicleType } from './delivery-pricing.constants';
import {
  DEFAULT_DELIVERY_TIMEZONE,
  DELIVERY_PREFERENCE_LABELS,
} from './delivery-preference.constants';
import type { DeliveryOptionsResponseDto, DeliverySlotViewDto } from './dto/delivery-options.dto';
import { DeliverySlotService } from './delivery-slot.service';
import {
  addDateKeyDays,
  formatDateLabel,
  generateScheduleWindows,
  isHubOpenAt,
  isRmcOrder,
  istWallTimeToUtc,
  remainingMinutesUntilClose,
  resolveHubHours,
  resolveLeadMinutes,
  utcToIst,
  type GeneratedSlotWindow,
} from './delivery-slot.logic';
import { parseWorkingHours } from './engine/delivery-eta.logic';

export type DeliveryOptionsContext = {
  serviceable: boolean;
  unavailableReason?: string | null;
  hubId?: string | null;
  hubName?: string | null;
  workingHours?: string | null;
  vehicleType?: string | null;
  vehicleDisplayName?: string | null;
  vehicleImageUrl?: string | null;
  logisticsType?: string | null;
  splitDelivery?: boolean;
  etaMinMinutes?: number | null;
  etaMaxMinutes?: number | null;
  etaLabel?: string | null;
};

@Injectable()
export class DeliveryOptionsService {
  constructor(
    private readonly slotService: DeliverySlotService,
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly coverageService: CoverageService,
    private readonly deliveryService: DeliveryService,
  ) {}

  async getOptionsForCustomer(
    customerId: string,
    addressId?: string,
  ): Promise<DeliveryOptionsResponseDto> {
    const cart = await this.cartService.getCartForCheckout(customerId);
    const address = addressId
      ? await this.prisma.address.findFirst({
          where: { id: addressId, customerId, deletedAt: null },
        })
      : ((await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null, isDefault: true },
        })) ??
        (await this.prisma.address.findFirst({
          where: { customerId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })));

    if (!address) {
      throw new NotFoundException(
        'No delivery address found. Please add an address before checkout.',
      );
    }

    const items = cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const routing = await this.coverageService.routeOrder(
      {
        latitude:
          address.latitude != null ? decimalToNumber(address.latitude) : null,
        longitude:
          address.longitude != null ? decimalToNumber(address.longitude) : null,
        pincode: address.pincode,
      },
      items,
    );
    const hub = routing.assignableHub ?? routing.nearestEligibleHub;
    const eta =
      address.latitude != null && address.longitude != null
        ? await this.deliveryService.calculateEta({
            latitude: decimalToNumber(address.latitude),
            longitude: decimalToNumber(address.longitude),
            pincode: address.pincode,
            cartItems: items,
          })
        : null;

    return this.buildOptions({
      serviceable: Boolean(eta?.serviceable ?? routing.nearestEligibleHub),
      unavailableReason: eta?.serviceable
        ? null
        : eta?.message ?? "We currently don't deliver to this location.",
      hubId: hub?.id ?? null,
      hubName: hub?.name ?? null,
      workingHours: hub?.workingHours ?? null,
      vehicleType: eta?.deliveryVehicleType ?? null,
      vehicleDisplayName: eta?.deliveryVehicleDisplayName ?? null,
      vehicleImageUrl: eta?.deliveryVehicleImageUrl ?? null,
      logisticsType: eta?.deliveryLogisticsType ?? null,
      splitDelivery: Boolean(
        eta?.deliveryVehicleCount && eta.deliveryVehicleCount > 1,
      ),
      etaMinMinutes: eta?.etaMinMinutes ?? eta?.deliveryETA ?? null,
      etaMaxMinutes: eta?.etaMaxMinutes ?? null,
      etaLabel: eta?.deliveryMessage ?? null,
    });
  }

  async buildOptions(
    context: DeliveryOptionsContext,
    now: Date = new Date(),
  ): Promise<DeliveryOptionsResponseDto> {
    const clock = utcToIst(now);
    const empty = this.emptyOptions(context, clock.dateKey);

    if (!context.serviceable || !context.hubId) {
      return {
        ...empty,
        serviceable: false,
        unavailableReason:
          context.unavailableReason ??
          "We currently don't deliver to this location.",
        defaultPreference: undefined,
      };
    }

    const isRmc = isRmcOrder({
      logisticsType: context.logisticsType,
      vehicleType: context.vehicleType,
    });
    const hours = resolveHubHours(parseWorkingHours(context.workingHours));
    const hubOpen = isHubOpenAt(hours, clock.minutesFromMidnight);
    const remainingToday = remainingMinutesUntilClose(
      hours,
      clock.minutesFromMidnight,
    );
    const etaMin = Math.max(0, Math.round(context.etaMinMinutes ?? 0));
    const etaMax = Math.max(etaMin, Math.round(context.etaMaxMinutes ?? etaMin));
    const leadMinutes = resolveLeadMinutes({ isRmc, etaMinMinutes: etaMin });
    const capacity = await this.slotService.countHubVehicleCapacity({
      hubId: context.hubId,
      vehicleType: context.vehicleType,
      logisticsType: context.logisticsType,
    });

    await this.slotService.expireStaleReservations();

    const windows = generateScheduleWindows({
      todayKey: clock.dateKey,
      nowMinutes: clock.minutesFromMidnight,
      hours,
      leadMinutes,
    });

    const allWindows = windows.scheduled.flatMap((day) => day.slots);
    const persisted = await Promise.all(
      allWindows.map((window) =>
        this.slotService.upsertSlot({
          hubId: context.hubId!,
          window,
          capacity,
          vehicleType: context.vehicleType,
          logisticsType: context.logisticsType,
        }),
      ),
    );
    const slotByKey = new Map(
      persisted.map((slot, index) => {
        const window = allWindows[index];
        return [`${window.dateKey}:${window.startMinutes}:${window.endMinutes}`, slot];
      }),
    );
    const reservationCounts = await this.slotService.loadReservationCounts(
      persisted.map((slot) => slot.id),
    );

    const toView = (window: GeneratedSlotWindow): DeliverySlotViewDto | null => {
      const row = slotByKey.get(
        `${window.dateKey}:${window.startMinutes}:${window.endMinutes}`,
      );
      if (!row) return null;
      const reserved = Math.max(
        row.reservedCapacity,
        reservationCounts.get(row.id) ?? 0,
      );
      const availableCapacity = Math.max(0, row.capacity - reserved);
      return {
        slotId: row.id,
        date: window.dateKey,
        dateLabel: window.dateLabel,
        startMinutes: window.startMinutes,
        endMinutes: window.endMinutes,
        label: window.label,
        startAt: istWallTimeToUtc(window.dateKey, window.startMinutes).toISOString(),
        endAt: istWallTimeToUtc(window.dateKey, window.endMinutes).toISOString(),
        available: availableCapacity > 0,
        capacity: row.capacity,
        reservedCapacity: reserved,
        availableCapacity,
      };
    };

    const todaySlots = windows.today
      .map(toView)
      .filter((slot): slot is DeliverySlotViewDto => Boolean(slot && slot.available));
    const tomorrowSlots = windows.tomorrow
      .map(toView)
      .filter((slot): slot is DeliverySlotViewDto => Boolean(slot && slot.available));
    const scheduled = windows.scheduled
      .map((day) => {
        const slots = day.slots
          .map(toView)
          .filter((slot): slot is DeliverySlotViewDto => Boolean(slot && slot.available));
        return {
          date: day.dateKey,
          dateLabel: day.dateLabel,
          available: slots.length > 0,
          slots,
        };
      })
      .filter((day) => day.available);

    const hubClosed = !hubOpen;
    const hubClosedMessage = hubClosed
      ? `${context.hubName ?? 'Hub'} is currently closed.`
      : null;

    const asapFitsToday = remainingToday > etaMax;
    const asapAvailable = isRmc
      ? hubOpen && asapFitsToday && Boolean(context.vehicleType)
      : Boolean(context.vehicleType) && (hubOpen ? asapFitsToday || todaySlots.length > 0 : true);

    const asapReason = !asapAvailable
      ? isRmc
        ? 'RMC needs a scheduled production slot.'
        : hubClosed
          ? hubClosedMessage
          : 'Fastest delivery is not available right now.'
      : null;

    const nextAvailable =
      todaySlots[0]
        ? {
            date: todaySlots[0].date,
            dateLabel: todaySlots[0].dateLabel,
            slotId: todaySlots[0].slotId,
            slotLabel: todaySlots[0].label,
          }
        : tomorrowSlots[0]
          ? {
              date: tomorrowSlots[0].date,
              dateLabel: tomorrowSlots[0].dateLabel,
              slotId: tomorrowSlots[0].slotId,
              slotLabel: tomorrowSlots[0].label,
            }
          : scheduled[0]?.slots[0]
            ? {
                date: scheduled[0].date,
                dateLabel: scheduled[0].dateLabel,
                slotId: scheduled[0].slots[0].slotId,
                slotLabel: scheduled[0].slots[0].label,
              }
            : null;

    const defaultPreference = asapAvailable
      ? 'ASAP'
      : todaySlots.length > 0
        ? 'TODAY'
        : tomorrowSlots.length > 0
          ? 'TOMORROW'
          : scheduled.length > 0
            ? 'SCHEDULED'
            : undefined;

    const vehicleDisplayName =
      context.vehicleDisplayName ??
      (context.vehicleType
        ? DELIVERY_VEHICLE_DISPLAY_NAMES[
            context.vehicleType as DeliveryVehicleType
          ]
        : null);

    return {
      serviceable: true,
      unavailableReason: null,
      hubClosed,
      hubClosedMessage,
      hubId: context.hubId,
      hubName: context.hubName ?? null,
      vehicleType: context.vehicleType ?? null,
      vehicleDisplayName: vehicleDisplayName ?? null,
      vehicleImageUrl: context.vehicleImageUrl ?? null,
      logisticsType: context.logisticsType ?? null,
      splitDelivery: Boolean(context.splitDelivery),
      splitDeliveryMessage: context.splitDelivery
        ? 'Items may arrive in multiple deliveries.'
        : null,
      timezone: DEFAULT_DELIVERY_TIMEZONE,
      asap: {
        available: Boolean(asapAvailable),
        etaMinMinutes: etaMin || null,
        etaMaxMinutes: etaMax || null,
        etaLabel: context.etaLabel ?? null,
        reason: asapReason,
      },
      today: {
        available: todaySlots.length > 0,
        date: clock.dateKey,
        dateLabel: formatDateLabel(clock.dateKey),
        slots: todaySlots,
        reason:
          todaySlots.length > 0
            ? null
            : hubClosed
              ? hubClosedMessage
              : nextAvailable
                ? `Next available delivery: ${nextAvailable.dateLabel}, ${nextAvailable.slotLabel}`
                : 'No same-day slots left.',
      },
      tomorrow: {
        available: tomorrowSlots.length > 0,
        date: addDateKeyDays(clock.dateKey, 1),
        dateLabel: formatDateLabel(addDateKeyDays(clock.dateKey, 1)),
        slots: tomorrowSlots,
        reason: tomorrowSlots.length > 0 ? null : 'No delivery slots tomorrow.',
      },
      scheduled,
      nextAvailable,
      defaultPreference,
    };
  }

  findSlot(
    options: DeliveryOptionsResponseDto,
    slotId: string,
  ): DeliverySlotViewDto | null {
    const fromToday = options.today.slots.find((slot) => slot.slotId === slotId);
    if (fromToday) return fromToday;
    const fromTomorrow = options.tomorrow.slots.find(
      (slot) => slot.slotId === slotId,
    );
    if (fromTomorrow) return fromTomorrow;
    for (const day of options.scheduled) {
      const match = day.slots.find((slot) => slot.slotId === slotId);
      if (match) return match;
    }
    return null;
  }

  preferenceLabel(type: string): string {
    return (
      DELIVERY_PREFERENCE_LABELS[
        type as keyof typeof DELIVERY_PREFERENCE_LABELS
      ] ?? type
    );
  }

  private emptyOptions(
    context: DeliveryOptionsContext,
    todayKey: string,
  ): DeliveryOptionsResponseDto {
    return {
      serviceable: false,
      unavailableReason: context.unavailableReason ?? null,
      hubClosed: false,
      hubClosedMessage: null,
      hubId: context.hubId ?? null,
      hubName: context.hubName ?? null,
      vehicleType: context.vehicleType ?? null,
      vehicleDisplayName: context.vehicleDisplayName ?? null,
      vehicleImageUrl: context.vehicleImageUrl ?? null,
      logisticsType: context.logisticsType ?? null,
      splitDelivery: Boolean(context.splitDelivery),
      splitDeliveryMessage: null,
      timezone: DEFAULT_DELIVERY_TIMEZONE,
      asap: { available: false, etaMinMinutes: null, etaMaxMinutes: null, etaLabel: null, reason: null },
      today: {
        available: false,
        date: todayKey,
        dateLabel: formatDateLabel(todayKey),
        slots: [],
        reason: null,
      },
      tomorrow: {
        available: false,
        date: addDateKeyDays(todayKey, 1),
        dateLabel: formatDateLabel(addDateKeyDays(todayKey, 1)),
        slots: [],
        reason: null,
      },
      scheduled: [],
      nextAvailable: null,
      defaultPreference: undefined,
    };
  }
}
