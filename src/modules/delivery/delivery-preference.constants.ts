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

/** Default customer-facing windows. Intersected with hub working hours. */
export const DEFAULT_SLOT_WINDOWS: ReadonlyArray<{
  startMinutes: number;
  endMinutes: number;
}> = [
  { startMinutes: 9 * 60, endMinutes: 12 * 60 },
  { startMinutes: 12 * 60, endMinutes: 15 * 60 },
  { startMinutes: 15 * 60, endMinutes: 18 * 60 },
  { startMinutes: 18 * 60, endMinutes: 20 * 60 },
];

export const DEFAULT_HUB_OPEN_MINUTES = 9 * 60;
export const DEFAULT_HUB_CLOSE_MINUTES = 21 * 60;
export const SCHEDULE_HORIZON_DAYS = 7;
export const SLOT_HOLD_MINUTES = 15;
export const DEFAULT_SLOT_CAPACITY = 8;
export const RMC_SLOT_CAPACITY = 2;
export const RMC_MIN_LEAD_MINUTES = 90;
export const MAX_DELIVERY_REMARK_LENGTH = 250;
export const MAX_ADMIN_INTERNAL_NOTE_LENGTH = 1000;

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
