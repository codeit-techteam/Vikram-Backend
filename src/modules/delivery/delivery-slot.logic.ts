import { formatClockFromMinutes } from './engine/delivery-eta.logic';
import type { DeliveryVehicleType } from './delivery-pricing.constants';
import {
  DEFAULT_DELIVERY_OPERATING_CONFIG,
  DEFAULT_DELIVERY_TIMEZONE,
  DEFAULT_HUB_CLOSE_MINUTES,
  DEFAULT_HUB_OPEN_MINUTES,
  DEFAULT_SLOT_CAPACITY,
  DEFAULT_SLOT_DURATION_MINUTES,
  DEFAULT_SLOT_WINDOWS,
  IST_OFFSET_MINUTES,
  MAX_DELIVERY_REMARK_LENGTH,
  RMC_MIN_LEAD_MINUTES,
  RMC_SLOT_CAPACITY,
  SCHEDULE_HORIZON_DAYS,
  type DeliveryOperatingConfigValues,
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

export type DayAvailabilityMeta = {
  dateKey: string;
  dateLabel: string;
  isHoliday: boolean;
  holidayReason: string | null;
  weekday: number;
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

/** ISO weekday 1=Mon … 7=Sun for a YYYY-MM-DD date key (calendar date in IST). */
export function isoWeekdayFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  return utcDay === 0 ? 7 : utcDay;
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

/** Intersect hub hours with global operating window. */
export function resolveEffectiveHours(
  hubHours: HubHours,
  operating: Pick<
    DeliveryOperatingConfigValues,
    'openMinutes' | 'closeMinutes'
  > = DEFAULT_DELIVERY_OPERATING_CONFIG,
): HubHours {
  const openMinutes = Math.max(hubHours.openMinutes, operating.openMinutes);
  const closeMinutes = Math.min(hubHours.closeMinutes, operating.closeMinutes);
  if (closeMinutes <= openMinutes) {
    return {
      openMinutes: operating.openMinutes,
      closeMinutes: operating.closeMinutes,
    };
  }
  return { openMinutes, closeMinutes };
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

export function isDeliveryHoliday(
  dateKey: string,
  operating: Pick<
    DeliveryOperatingConfigValues,
    'workingWeekdays' | 'holidayDates'
  > = DEFAULT_DELIVERY_OPERATING_CONFIG,
): { isHoliday: boolean; reason: string | null } {
  const weekday = isoWeekdayFromDateKey(dateKey);
  if (operating.holidayDates.includes(dateKey)) {
    return { isHoliday: true, reason: 'DELIVERY_HOLIDAY' };
  }
  if (!operating.workingWeekdays.includes(weekday)) {
    return {
      isHoliday: true,
      reason: weekday === 7 ? 'DELIVERY_HOLIDAY' : 'DELIVERY_HOLIDAY',
    };
  }
  return { isHoliday: false, reason: null };
}

export function nextAvailableDeliveryDate(
  fromDateKey: string,
  operating: DeliveryOperatingConfigValues = DEFAULT_DELIVERY_OPERATING_CONFIG,
  maxLookahead = 21,
): string | null {
  for (let offset = 0; offset <= maxLookahead; offset += 1) {
    const dateKey = addDateKeyDays(fromDateKey, offset);
    if (!isDeliveryHoliday(dateKey, operating).isHoliday) {
      return dateKey;
    }
  }
  return null;
}

export function intersectWindowWithHours(
  window: { startMinutes: number; endMinutes: number },
  hours: HubHours,
  minDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
): { startMinutes: number; endMinutes: number } | null {
  if (hours.closeMinutes < hours.openMinutes) {
    return window;
  }
  const start = Math.max(window.startMinutes, hours.openMinutes);
  const end = Math.min(window.endMinutes, hours.closeMinutes);
  if (end - start < minDurationMinutes) return null;
  return { startMinutes: start, endMinutes: end };
}

/** Build fixed-duration slots within effective hours. */
export function buildDurationSlots(
  hours: HubHours,
  slotDurationMinutes: number,
): Array<{ startMinutes: number; endMinutes: number }> {
  const duration = Math.max(5, Math.round(slotDurationMinutes));
  const slots: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (
    let start = hours.openMinutes;
    start + duration <= hours.closeMinutes;
    start += duration
  ) {
    slots.push({ startMinutes: start, endMinutes: start + duration });
  }
  return slots;
}

export function generateSlotWindowsForDate(input: {
  dateKey: string;
  hours: HubHours;
  isToday: boolean;
  nowMinutes: number;
  leadMinutes: number;
  slotDurationMinutes?: number;
  operating?: DeliveryOperatingConfigValues;
}): GeneratedSlotWindow[] {
  const operating = input.operating ?? DEFAULT_DELIVERY_OPERATING_CONFIG;
  if (isDeliveryHoliday(input.dateKey, operating).isHoliday) {
    return [];
  }

  const duration =
    input.slotDurationMinutes ?? operating.slotDurationMinutes;
  const candidateWindows =
    duration > 0
      ? buildDurationSlots(input.hours, duration)
      : [...DEFAULT_SLOT_WINDOWS];

  const slots: GeneratedSlotWindow[] = [];
  for (const window of candidateWindows) {
    const clipped = intersectWindowWithHours(
      window,
      input.hours,
      duration,
    );
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
  operating?: DeliveryOperatingConfigValues;
}): {
  today: GeneratedSlotWindow[];
  tomorrow: GeneratedSlotWindow[];
  scheduled: Array<{
    dateKey: string;
    dateLabel: string;
    slots: GeneratedSlotWindow[];
    isHoliday: boolean;
    holidayReason: string | null;
  }>;
  calendar: DayAvailabilityMeta[];
} {
  const operating = input.operating ?? DEFAULT_DELIVERY_OPERATING_CONFIG;
  const horizon = input.horizonDays ?? SCHEDULE_HORIZON_DAYS;
  const today = generateSlotWindowsForDate({
    dateKey: input.todayKey,
    hours: input.hours,
    isToday: true,
    nowMinutes: input.nowMinutes,
    leadMinutes: input.leadMinutes,
    operating,
  });
  const tomorrowKey = addDateKeyDays(input.todayKey, 1);
  const tomorrow = generateSlotWindowsForDate({
    dateKey: tomorrowKey,
    hours: input.hours,
    isToday: false,
    nowMinutes: input.nowMinutes,
    leadMinutes: input.leadMinutes,
    operating,
  });
  const scheduled: Array<{
    dateKey: string;
    dateLabel: string;
    slots: GeneratedSlotWindow[];
    isHoliday: boolean;
    holidayReason: string | null;
  }> = [];
  const calendar: DayAvailabilityMeta[] = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    const dateKey = addDateKeyDays(input.todayKey, offset);
    const holiday = isDeliveryHoliday(dateKey, operating);
    calendar.push({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      isHoliday: holiday.isHoliday,
      holidayReason: holiday.reason,
      weekday: isoWeekdayFromDateKey(dateKey),
    });
    const slots = generateSlotWindowsForDate({
      dateKey,
      hours: input.hours,
      isToday: offset === 0,
      nowMinutes: input.nowMinutes,
      leadMinutes: input.leadMinutes,
      operating,
    });
    scheduled.push({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      slots,
      isHoliday: holiday.isHoliday,
      holidayReason: holiday.reason,
    });
  }
  return { today, tomorrow, scheduled, calendar };
}

/**
 * Validate a proposed slot against operating rules (backend authority).
 * Returns null when valid; otherwise a machine-readable error code.
 */
export function validateSlotAgainstOperatingRules(input: {
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  operating?: DeliveryOperatingConfigValues;
}): string | null {
  const operating = input.operating ?? DEFAULT_DELIVERY_OPERATING_CONFIG;
  const holiday = isDeliveryHoliday(input.dateKey, operating);
  if (holiday.isHoliday) {
    return 'DELIVERY_SLOT_UNAVAILABLE';
  }
  if (
    input.startMinutes < operating.openMinutes ||
    input.endMinutes > operating.closeMinutes ||
    input.endMinutes <= input.startMinutes
  ) {
    return 'DELIVERY_SLOT_UNAVAILABLE';
  }
  if (operating.slotDurationMinutes > 0) {
    const duration = input.endMinutes - input.startMinutes;
    const offset = input.startMinutes - operating.openMinutes;
    if (
      duration !== operating.slotDurationMinutes ||
      offset < 0 ||
      offset % operating.slotDurationMinutes !== 0
    ) {
      return 'DELIVERY_SLOT_UNAVAILABLE';
    }
  }
  return null;
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

export function requiresOpenAreaConfirmation(
  vehicleType?: DeliveryVehicleType | string | null,
): boolean {
  if (!vehicleType) return false;
  return (
    vehicleType === 'THREE_WHEELER_LOADER' ||
    vehicleType === 'FULL_TRUCK' ||
    vehicleType === 'HEAVY_LOADER' ||
    vehicleType === 'RMC_TRANSIT_MIXER'
  );
}
