import type { DeliveryVehicleType } from './delivery-pricing.constants';

export const DEFAULT_DELIVERY_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;

export const DELIVERY_PREFERENCE_TYPES = [
  'ASAP',
  'TODAY',
  'TOMORROW',
  'SCHEDULED',
] as const;

export type DeliveryPreferenceType = (typeof DELIVERY_PREFERENCE_TYPES)[number];

export const DELIVERY_PREFERENCE_LABELS: Record<
  DeliveryPreferenceType,
  string
> = {
  ASAP: 'As soon as possible',
  TODAY: 'Deliver today',
  TOMORROW: 'Deliver tomorrow',
  SCHEDULED: 'Scheduled delivery',
};

/** ISO weekday: 1 = Monday … 7 = Sunday (ISO-8601). */
export const DEFAULT_WORKING_WEEKDAYS: ReadonlyArray<number> = [
  1, 2, 3, 4, 5, 6,
];

/** Production operating window: 11:00 AM – 4:30 PM IST. */
export const DEFAULT_OPERATING_OPEN_MINUTES = 11 * 60;
export const DEFAULT_OPERATING_CLOSE_MINUTES = 16 * 60 + 30;
export const DEFAULT_SLOT_DURATION_MINUTES = 30;

/**
 * @deprecated Prefer config-driven slot duration. Kept as a fallback for
 * coarse windows when duration-based generation is unavailable.
 */
export const DEFAULT_SLOT_WINDOWS: ReadonlyArray<{
  startMinutes: number;
  endMinutes: number;
}> = [
  {
    startMinutes: DEFAULT_OPERATING_OPEN_MINUTES,
    endMinutes: DEFAULT_OPERATING_CLOSE_MINUTES,
  },
];

/** Defaults used when hub workingHours string is missing/unparseable. */
export const DEFAULT_HUB_OPEN_MINUTES = DEFAULT_OPERATING_OPEN_MINUTES;
export const DEFAULT_HUB_CLOSE_MINUTES = DEFAULT_OPERATING_CLOSE_MINUTES;

export const SCHEDULE_HORIZON_DAYS = 14;
export const SLOT_HOLD_MINUTES = 15;
export const DEFAULT_SLOT_CAPACITY = 8;
export const RMC_SLOT_CAPACITY = 2;
export const RMC_MIN_LEAD_MINUTES = 90;
export const MAX_DELIVERY_REMARK_LENGTH = 250;
export const MAX_ADMIN_INTERNAL_NOTE_LENGTH = 1000;

export const DELIVERY_SLOT_UNAVAILABLE = 'DELIVERY_SLOT_UNAVAILABLE';
export const DELIVERY_HOLIDAY = 'DELIVERY_HOLIDAY';

/** Vehicles that require site open-area confirmation at checkout. */
export const HEAVY_VEHICLE_TYPES_REQUIRING_OPEN_AREA: ReadonlyArray<DeliveryVehicleType> =
  [
    'THREE_WHEELER_LOADER',
    'FULL_TRUCK',
    'HEAVY_LOADER',
    'RMC_TRANSIT_MIXER',
  ];

export const FLEET_TYPES_FOR_DELIVERY_VEHICLE: Record<
  DeliveryVehicleType,
  ReadonlyArray<'TRUCK' | 'TEMPO' | 'BIKE' | 'OTHER'>
> = {
  BIKE: ['BIKE'],
  E_LOADER: ['OTHER', 'TEMPO'],
  THREE_WHEELER_LOADER: ['OTHER', 'TEMPO'],
  PICK_UP_VAN: ['TEMPO'],
  FULL_TRUCK: ['TRUCK'],
  HEAVY_LOADER: ['TRUCK'],
  RMC_TRANSIT_MIXER: ['TRUCK', 'OTHER'],
};

export type DeliveryOperatingConfigValues = {
  timezone: string;
  openMinutes: number;
  closeMinutes: number;
  slotDurationMinutes: number;
  workingWeekdays: number[];
  holidayDates: string[];
};

export const DEFAULT_DELIVERY_OPERATING_CONFIG: DeliveryOperatingConfigValues = {
  timezone: DEFAULT_DELIVERY_TIMEZONE,
  openMinutes: DEFAULT_OPERATING_OPEN_MINUTES,
  closeMinutes: DEFAULT_OPERATING_CLOSE_MINUTES,
  slotDurationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
  workingWeekdays: [...DEFAULT_WORKING_WEEKDAYS],
  holidayDates: [],
};
