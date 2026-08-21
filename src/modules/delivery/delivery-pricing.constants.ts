/** Customer-app delivery pricing vehicle types (matches Prisma DeliveryVehicleType). */
export const DeliveryVehicleType = {
  BIKE: 'BIKE',
  E_LOADER: 'E_LOADER',
  THREE_WHEELER_LOADER: 'THREE_WHEELER_LOADER',
  PICK_UP_VAN: 'PICK_UP_VAN',
  FULL_TRUCK: 'FULL_TRUCK',
  HEAVY_LOADER: 'HEAVY_LOADER',
  RMC_TRANSIT_MIXER: 'RMC_TRANSIT_MIXER',
} as const;

export type DeliveryVehicleType =
  (typeof DeliveryVehicleType)[keyof typeof DeliveryVehicleType];

/** Display names shared across Admin, Customer App, Hub, and APIs. */
export const DELIVERY_VEHICLE_DISPLAY_NAMES: Record<
  DeliveryVehicleType,
  string
> = {
  BIKE: 'Bike',
  E_LOADER: 'E-Loader',
  THREE_WHEELER_LOADER: '3 Wheeler Loader',
  PICK_UP_VAN: 'Pick Up Van',
  FULL_TRUCK: 'Full Truck',
  HEAVY_LOADER: '600 sqft Loader',
  RMC_TRANSIT_MIXER: 'RMC Transit Mixer',
};

export const DELIVERY_VEHICLE_TYPES = Object.values(
  DeliveryVehicleType,
) as DeliveryVehicleType[];

/**
 * Quantity → vehicle allocation (bag-equivalent units).
 * Used ONLY as migration fallback when Admin has not configured vehicle
 * capacities and/or product weight/volume logistics attributes.
 * Prefer DeliveryVehicleConfig capacity matching in production.
 */
export const DELIVERY_VEHICLE_QTY_TIERS: ReadonlyArray<{
  type: DeliveryVehicleType;
  maxQty: number;
}> = [
  { type: DeliveryVehicleType.BIKE, maxQty: 10 },
  { type: DeliveryVehicleType.E_LOADER, maxQty: 25 },
  { type: DeliveryVehicleType.THREE_WHEELER_LOADER, maxQty: 50 },
  { type: DeliveryVehicleType.PICK_UP_VAN, maxQty: 150 },
  { type: DeliveryVehicleType.FULL_TRUCK, maxQty: Number.POSITIVE_INFINITY },
  // RMC is never selected via qty tiers — only via allowedVehicleTypes / logistics.
];

/** Excel initial seed (runtime DB is source of truth after import). */
export const INITIAL_DELIVERY_PRICING_SEED: ReadonlyArray<{
  vehicleType: DeliveryVehicleType;
  distanceFromKm: number;
  distanceToKm: number;
  price: number;
}> = [
  {
    vehicleType: DeliveryVehicleType.BIKE,
    distanceFromKm: 0,
    distanceToKm: 3,
    price: 100,
  },
  {
    vehicleType: DeliveryVehicleType.E_LOADER,
    distanceFromKm: 0,
    distanceToKm: 3,
    price: 250,
  },
  {
    vehicleType: DeliveryVehicleType.E_LOADER,
    distanceFromKm: 0,
    distanceToKm: 4,
    price: 350,
  },
  {
    vehicleType: DeliveryVehicleType.E_LOADER,
    distanceFromKm: 0,
    distanceToKm: 5,
    price: 450,
  },
  {
    vehicleType: DeliveryVehicleType.THREE_WHEELER_LOADER,
    distanceFromKm: 0,
    distanceToKm: 3,
    price: 350,
  },
  {
    vehicleType: DeliveryVehicleType.THREE_WHEELER_LOADER,
    distanceFromKm: 0,
    distanceToKm: 4,
    price: 450,
  },
  {
    vehicleType: DeliveryVehicleType.THREE_WHEELER_LOADER,
    distanceFromKm: 0,
    distanceToKm: 5,
    price: 550,
  },
  {
    vehicleType: DeliveryVehicleType.PICK_UP_VAN,
    distanceFromKm: 0,
    distanceToKm: 3,
    price: 450,
  },
  {
    vehicleType: DeliveryVehicleType.PICK_UP_VAN,
    distanceFromKm: 0,
    distanceToKm: 4,
    price: 550,
  },
  {
    vehicleType: DeliveryVehicleType.PICK_UP_VAN,
    distanceFromKm: 0,
    distanceToKm: 5,
    price: 650,
  },
  {
    vehicleType: DeliveryVehicleType.FULL_TRUCK,
    distanceFromKm: 0,
    distanceToKm: 3,
    price: 1500,
  },
  {
    vehicleType: DeliveryVehicleType.FULL_TRUCK,
    distanceFromKm: 0,
    distanceToKm: 4,
    price: 1600,
  },
  {
    vehicleType: DeliveryVehicleType.FULL_TRUCK,
    distanceFromKm: 0,
    distanceToKm: 5,
    price: 1700,
  },
];

export const DEFAULT_FREE_BIKE_DELIVERIES = 3;
export const DEFAULT_COMPANY_ABSORPTION_INR = 99;

export function resolveDeliveryVehicleForQuantity(
  quantity: number,
): DeliveryVehicleType {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  for (const tier of DELIVERY_VEHICLE_QTY_TIERS) {
    if (qty <= tier.maxQty) return tier.type;
  }
  return DeliveryVehicleType.FULL_TRUCK;
}

export function formatDistanceSlab(fromKm: number, toKm: number): string {
  const from = Number.isInteger(fromKm) ? String(fromKm) : fromKm.toFixed(1);
  const to = Number.isInteger(toKm) ? String(toKm) : toKm.toFixed(1);
  return `${from}–${to} km`;
}
