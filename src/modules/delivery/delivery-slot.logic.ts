import { formatClockFromMinutes } from './engine/delivery-eta.logic';
import type { DeliveryVehicleType } from './delivery-pricing.constants';
import {
  DEFAULT_DELIVERY_TIMEZONE,
  DEFAULT_HUB_CLOSE_MINUTES,
  DEFAULT_HUB_OPEN_MINUTES,
  DEFAULT_SLOT_CAPACITY,
  DEFAULT_SLOT_WINDOWS,
  IST_OFFSET_MINUTES,
  MAX_DELIVERY_REMARK_LENGTH,
  RMC_MIN_LEAD_MINUTES,
  RMC_SLOT_CAPACITY,
  SCHEDULE_HORIZON_DAYS,
  type DeliveryPreferenceType,
} from './delivery-preference.constants';

export type HubHours = { openMinutes: number; closeMinutes: number };

export type GeneratedSlotWindow = {
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  cutoffMinutes: number;
  label: string;
  dateLabel: string;
};

export function utcToIst(now: Date = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1;
  const day = ist.getUTCDate();
  const hour = ist.getUTCHours();
  const minute = ist.getUTCMinutes();
  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesFromMidnight: hour * 60 + minute,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeZone: DEFAULT_DELIVERY_TIMEZONE,
  };
}

export function addDateKeyDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function dateKeyToUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function istWallTimeToUtc(
  dateKey: string,
  minutesFromMidnight: number,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      minutesFromMidnight - IST_OFFSET_MINUTES,
      0,
    ),
  );
}

export function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatSlotLabel(
  startMinutes: number,
  endMinutes: number,
): string {
  return `${formatClockFromMinutes(startMinutes)} – ${formatClockFromMinutes(endMinutes)}`;
}

export function resolveHubHours(parsed: HubHours | null | undefined): HubHours {
  if (
    parsed &&
    Number.isFinite(parsed.openMinutes) &&
    Number.isFinite(parsed.closeMinutes) &&
    parsed.closeMinutes !== parsed.openMinutes
  ) {
    return parsed;
  }
  return {
    openMinutes: DEFAULT_HUB_OPEN_MINUTES,
    closeMinutes: DEFAULT_HUB_CLOSE_MINUTES,
  };
}

export function isHubOpenAt(
  hours: HubHours,
  minutesFromMidnight: number,
): boolean {
  const wrapsMidnight = hours.closeMinutes < hours.openMinutes;
  if (wrapsMidnight) {
    return (
      minutesFromMidnight >= hours.openMinutes ||
      minutesFromMidnight <= hours.closeMinutes
    );
  }
  return (
    minutesFromMidnight >= hours.openMinutes &&
    minutesFromMidnight <= hours.closeMinutes
  );
}

export function remainingMinutesUntilClose(
  hours: HubHours,
  minutesFromMidnight: number,
): number {
  if (hours.closeMinutes < hours.openMinutes) {
    if (minutesFromMidnight <= hours.closeMinutes) {
      return hours.closeMinutes - minutesFromMidnight;
    }
    return 24 * 60 - minutesFromMidnight + hours.closeMinutes;
  }
  return Math.max(0, hours.closeMinutes - minutesFromMidnight);
}

export function resolveLeadMinutes(input: {
  isRmc: boolean;
  etaMinMinutes: number;
}): number {
  const etaLead = Math.max(0, Math.round(input.etaMinMinutes || 0));
  if (input.isRmc) return Math.max(RMC_MIN_LEAD_MINUTES, etaLead);
  return etaLead;
}

export function resolveSlotCapacity(input: {
  isRmc: boolean;
  vehicleCapacity?: number | null;
}): number {
  if (input.vehicleCapacity && input.vehicleCapacity > 0) {
    return input.vehicleCapacity;
  }
  return input.isRmc ? RMC_SLOT_CAPACITY : DEFAULT_SLOT_CAPACITY;
}

export function intersectWindowWithHours(
  window: { startMinutes: number; endMinutes: number },
  hours: HubHours,
): { startMinutes: number; endMinutes: number } | null {
  if (hours.closeMinutes < hours.openMinutes) {
    return window;
  }
  const start = Math.max(window.startMinutes, hours.openMinutes);
  const end = Math.min(window.endMinutes, hours.closeMinutes);
  if (end - start < 60) return null;
  return { startMinutes: start, endMinutes: end };
}

export function generateSlotWindowsForDate(input: {
  dateKey: string;
  hours: HubHours;
  isToday: boolean;
  nowMinutes: number;
  leadMinutes: number;
}): GeneratedSlotWindow[] {
  const slots: GeneratedSlotWindow[] = [];
  for (const window of DEFAULT_SLOT_WINDOWS) {
    const clipped = intersectWindowWithHours(window, input.hours);
    if (!clipped) continue;
    const cutoffMinutes = Math.max(
      input.hours.openMinutes,
      clipped.startMinutes - input.leadMinutes,
    );
    if (input.isToday) {
      const earliestStart = input.nowMinutes + input.leadMinutes;
      if (clipped.endMinutes <= earliestStart) continue;
      if (
        input.nowMinutes >= cutoffMinutes &&
        clipped.startMinutes < earliestStart
      ) {
        continue;
      }
    }
    slots.push({
      dateKey: input.dateKey,
      startMinutes: clipped.startMinutes,
      endMinutes: clipped.endMinutes,
      cutoffMinutes,
      label: formatSlotLabel(clipped.startMinutes, clipped.endMinutes),
      dateLabel: formatDateLabel(input.dateKey),
    });
  }
  return slots;
}

export function generateScheduleWindows(input: {
  todayKey: string;
  nowMinutes: number;
  hours: HubHours;
  leadMinutes: number;
  horizonDays?: number;
}): {
  today: GeneratedSlotWindow[];
  tomorrow: GeneratedSlotWindow[];
  scheduled: Array<{
    dateKey: string;
    dateLabel: string;
    slots: GeneratedSlotWindow[];
  }>;
} {
  const horizon = input.horizonDays ?? SCHEDULE_HORIZON_DAYS;
  const today = generateSlotWindowsForDate({
    dateKey: input.todayKey,
    hours: input.hours,
    isToday: true,
    nowMinutes: input.nowMinutes,
    leadMinutes: input.leadMinutes,
  });
  const tomorrowKey = addDateKeyDays(input.todayKey, 1);
  const tomorrow = generateSlotWindowsForDate({
    dateKey: tomorrowKey,
    hours: input.hours,
    isToday: false,
    nowMinutes: input.nowMinutes,
    leadMinutes: input.leadMinutes,
  });
  const scheduled: Array<{
    dateKey: string;
    dateLabel: string;
    slots: GeneratedSlotWindow[];
  }> = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    const dateKey = addDateKeyDays(input.todayKey, offset);
    const slots = generateSlotWindowsForDate({
      dateKey,
      hours: input.hours,
      isToday: offset === 0,
      nowMinutes: input.nowMinutes,
      leadMinutes: input.leadMinutes,
    });
    if (slots.length === 0) continue;
    scheduled.push({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      slots,
    });
  }
  return { today, tomorrow, scheduled };
}

export function sanitizeDeliveryRemark(raw?: string | null): string | null {
  if (raw == null) return null;
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, MAX_DELIVERY_REMARK_LENGTH);
}

export function preferenceRequiresSlot(
  type: DeliveryPreferenceType | string | null | undefined,
): boolean {
  return type === 'TODAY' || type === 'TOMORROW' || type === 'SCHEDULED';
}

export function slotMatchesPreference(input: {
  type: DeliveryPreferenceType;
  slotDateKey: string;
  todayKey: string;
}): boolean {
  if (input.type === 'ASAP') return true;
  if (input.type === 'TODAY') return input.slotDateKey === input.todayKey;
  if (input.type === 'TOMORROW') {
    return input.slotDateKey === addDateKeyDays(input.todayKey, 1);
  }
  return input.slotDateKey >= input.todayKey;
}

export function isRmcOrder(input: {
  logisticsType?: string | null;
  vehicleType?: DeliveryVehicleType | string | null;
}): boolean {
  return (
    input.logisticsType === 'RMC' || input.vehicleType === 'RMC_TRANSIT_MIXER'
  );
}
