import {
  DeliveryVehicleType,
  type DeliveryVehicleType as VehicleType,
} from '../delivery-pricing.constants';

export type LogisticsType =
  | 'PARCEL'
  | 'LIGHT_MATERIAL'
  | 'BULK_MATERIAL'
  | 'HEAVY_MATERIAL'
  | 'RMC'
  | 'LIQUID'
  | 'AGGREGATE'
  | 'BRICKS'
  | 'CEMENT'
  | 'STEEL'
  | 'SAND'
  | 'WATERPROOFING'
  | 'ADHESIVE'
  | 'WALL_PUTTY'
  | 'QUICK_REPAIR'
  | 'SPECIALIZED';

export interface MaterialTransportProfile {
  logisticsType: LogisticsType;
  allowedVehicleTypes: VehicleType[];
  preferredVehicleType: VehicleType;
  minimumVehicleType: VehicleType;
  bikeAllowed: boolean;
  eLoaderAllowed: boolean;
  autoAllowed: boolean;
  pickupAllowed: boolean;
  heavyVehicleRequired: boolean;
  /** Category-profile default kg per sellable unit when product weight is unset. */
  defaultWeightPerUnitKg: number | null;
  defaultVolumePerUnitCft: number | null;
  bulkDensityKgPerCft: number | null;
  /** Hub preparation before loading starts. */
  preparationTimeMinutes: number;
  /** Fixed loading overhead (spotting, opening, first lift). */
  loadingBaseTimeMinutes: number;
  /** Fixed unloading overhead at site. */
  unloadingBaseTimeMinutes: number;
  /** Operational loading rate — not a static +N minutes per category. */
  handlingKgPerMinute: number;
  unloadingKgPerMinute: number;
  reason: string;
}

const HEAVY: VehicleType[] = [
  DeliveryVehicleType.PICK_UP_VAN,
  DeliveryVehicleType.FULL_TRUCK,
  DeliveryVehicleType.HEAVY_LOADER,
];

const CEMENT_VEHICLES: VehicleType[] = [
  DeliveryVehicleType.E_LOADER,
  DeliveryVehicleType.THREE_WHEELER_LOADER,
  DeliveryVehicleType.PICK_UP_VAN,
  DeliveryVehicleType.FULL_TRUCK,
  DeliveryVehicleType.HEAVY_LOADER,
];

const PACKAGED: VehicleType[] = [
  DeliveryVehicleType.BIKE,
  DeliveryVehicleType.E_LOADER,
  DeliveryVehicleType.THREE_WHEELER_LOADER,
  DeliveryVehicleType.PICK_UP_VAN,
  DeliveryVehicleType.FULL_TRUCK,
  DeliveryVehicleType.HEAVY_LOADER,
];

export const MATERIAL_TRANSPORT_PROFILES: Record<string, MaterialTransportProfile> =
  {
    AGGREGATE: {
      logisticsType: 'AGGREGATE',
      allowedVehicleTypes: HEAVY,
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: true,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: null,
      defaultVolumePerUnitCft: 1,
      bulkDensityKgPerCft: 42,
      preparationTimeMinutes: 14,
      loadingBaseTimeMinutes: 12,
      unloadingBaseTimeMinutes: 10,
      handlingKgPerMinute: 300,
      unloadingKgPerMinute: 240,
      reason:
        'Stone aggregate / blue metal is heavy bulk material and is not eligible for Bike or E-Loader delivery.',
    },
    SAND: {
      logisticsType: 'SAND',
      allowedVehicleTypes: HEAVY,
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: true,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: null,
      defaultVolumePerUnitCft: 1,
      bulkDensityKgPerCft: 45,
      preparationTimeMinutes: 12,
      loadingBaseTimeMinutes: 10,
      unloadingBaseTimeMinutes: 8,
      handlingKgPerMinute: 350,
      unloadingKgPerMinute: 280,
      reason:
        'Sand is bulk/heavy material and is not eligible for Bike or E-Loader delivery.',
    },
    RMC: {
      logisticsType: 'RMC',
      allowedVehicleTypes: [DeliveryVehicleType.RMC_TRANSIT_MIXER],
      preferredVehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
      minimumVehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: false,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: 2400,
      defaultVolumePerUnitCft: 35.315,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 25,
      loadingBaseTimeMinutes: 15,
      unloadingBaseTimeMinutes: 8,
      handlingKgPerMinute: 400,
      unloadingKgPerMinute: 300,
      reason: 'RMC requires a transit mixer truck and cannot use Bike, E-Loader, or Pickup.',
    },
    BRICKS: {
      logisticsType: 'BRICKS',
      allowedVehicleTypes: [
        DeliveryVehicleType.THREE_WHEELER_LOADER,
        DeliveryVehicleType.PICK_UP_VAN,
        DeliveryVehicleType.FULL_TRUCK,
        DeliveryVehicleType.HEAVY_LOADER,
      ],
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.THREE_WHEELER_LOADER,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 2.5,
      defaultVolumePerUnitCft: 0.05,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 10,
      loadingBaseTimeMinutes: 15,
      unloadingBaseTimeMinutes: 12,
      handlingKgPerMinute: 80,
      unloadingKgPerMinute: 70,
      reason: 'Bricks are not bike-compatible; bulk brick loads require Pickup or a heavy vehicle.',
    },
    CEMENT: {
      logisticsType: 'CEMENT',
      allowedVehicleTypes: CEMENT_VEHICLES,
      preferredVehicleType: DeliveryVehicleType.E_LOADER,
      minimumVehicleType: DeliveryVehicleType.E_LOADER,
      bikeAllowed: false,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 50,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 6,
      loadingBaseTimeMinutes: 8,
      unloadingBaseTimeMinutes: 6,
      handlingKgPerMinute: 150,
      unloadingKgPerMinute: 120,
      reason: 'Cement bags exceed typical Bike payload; vehicle is selected from total bag weight.',
    },
    STEEL: {
      logisticsType: 'STEEL',
      allowedVehicleTypes: HEAVY,
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: true,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: 1,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 10,
      loadingBaseTimeMinutes: 15,
      unloadingBaseTimeMinutes: 12,
      handlingKgPerMinute: 200,
      unloadingKgPerMinute: 160,
      reason: 'Steel is heavy material and is not eligible for Bike delivery.',
    },
    WATERPROOFING: {
      logisticsType: 'WATERPROOFING',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.BIKE,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 5,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 4,
      loadingBaseTimeMinutes: 4,
      unloadingBaseTimeMinutes: 3,
      handlingKgPerMinute: 70,
      unloadingKgPerMinute: 70,
      reason: 'Packaged waterproofing can use Bike or E-Loader when payload allows.',
    },
    ADHESIVE: {
      logisticsType: 'ADHESIVE',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.BIKE,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 5,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 3,
      loadingBaseTimeMinutes: 3,
      unloadingBaseTimeMinutes: 2,
      handlingKgPerMinute: 80,
      unloadingKgPerMinute: 80,
      reason: 'Packaged adhesive can use Bike or E-Loader when payload allows.',
    },
    WALL_PUTTY: {
      logisticsType: 'WALL_PUTTY',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.E_LOADER,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 20,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 5,
      loadingBaseTimeMinutes: 6,
      unloadingBaseTimeMinutes: 4,
      handlingKgPerMinute: 60,
      unloadingKgPerMinute: 50,
      reason: 'Wall putty bags are packaged; vehicle is selected from total bag weight.',
    },
    QUICK_REPAIR: {
      logisticsType: 'QUICK_REPAIR',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.BIKE,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 1,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 2,
      loadingBaseTimeMinutes: 3,
      unloadingBaseTimeMinutes: 2,
      handlingKgPerMinute: 50,
      unloadingKgPerMinute: 50,
      reason: 'Small packaged repair products can use Bike when payload allows.',
    },
    LIGHT_MATERIAL: {
      logisticsType: 'LIGHT_MATERIAL',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.BIKE,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 5,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 4,
      loadingBaseTimeMinutes: 5,
      unloadingBaseTimeMinutes: 3,
      handlingKgPerMinute: 80,
      unloadingKgPerMinute: 70,
      reason: 'Lightweight packaged goods may use Bike when total load is within payload.',
    },
    PARCEL: {
      logisticsType: 'PARCEL',
      allowedVehicleTypes: PACKAGED,
      preferredVehicleType: DeliveryVehicleType.BIKE,
      minimumVehicleType: DeliveryVehicleType.BIKE,
      bikeAllowed: true,
      eLoaderAllowed: true,
      autoAllowed: true,
      pickupAllowed: true,
      heavyVehicleRequired: false,
      defaultWeightPerUnitKg: 1,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 2,
      loadingBaseTimeMinutes: 3,
      unloadingBaseTimeMinutes: 2,
      handlingKgPerMinute: 60,
      unloadingKgPerMinute: 50,
      reason: 'Parcel items may use Bike when total load is within payload.',
    },
    HEAVY_MATERIAL: {
      logisticsType: 'HEAVY_MATERIAL',
      allowedVehicleTypes: HEAVY,
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: true,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: null,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: null,
      preparationTimeMinutes: 10,
      loadingBaseTimeMinutes: 12,
      unloadingBaseTimeMinutes: 10,
      handlingKgPerMinute: 250,
      unloadingKgPerMinute: 200,
      reason: 'Heavy construction material requires Pickup or a larger vehicle.',
    },
    BULK_MATERIAL: {
      logisticsType: 'BULK_MATERIAL',
      allowedVehicleTypes: HEAVY,
      preferredVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      minimumVehicleType: DeliveryVehicleType.PICK_UP_VAN,
      bikeAllowed: false,
      eLoaderAllowed: false,
      autoAllowed: false,
      pickupAllowed: true,
      heavyVehicleRequired: true,
      defaultWeightPerUnitKg: null,
      defaultVolumePerUnitCft: null,
      bulkDensityKgPerCft: 40,
      preparationTimeMinutes: 12,
      loadingBaseTimeMinutes: 10,
      unloadingBaseTimeMinutes: 8,
      handlingKgPerMinute: 300,
      unloadingKgPerMinute: 250,
      reason: 'Bulk material is not eligible for Bike delivery.',
    },
  };

const MASS_UNITS = new Set([
  'mt',
  'ton',
  'tonne',
  'tonnes',
  'metric ton',
  'metric tonne',
  'metric tons',
]);

const CUM_UNITS = new Set([
  'cum',
  'cu.m',
  'cu m',
  'm3',
  'm³',
  'cubic meter',
  'cubic metre',
  'cubic meters',
  'cubic metres',
]);

const CFT_UNITS = new Set(['cft', 'cu.ft', 'cu ft', 'cubic feet', 'ft3', 'ft³']);

export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLowerCase();
}

export function isMassUnit(unit: string | null | undefined): boolean {
  return MASS_UNITS.has(normalizeUnit(unit));
}

export function isCubicMeterUnit(unit: string | null | undefined): boolean {
  return CUM_UNITS.has(normalizeUnit(unit));
}

export function isCftUnit(unit: string | null | undefined): boolean {
  return CFT_UNITS.has(normalizeUnit(unit));
}

/**
 * Infer logistics class from category slug, product name, and unit.
 * stone-chips / blue metal / 20mm aggregate must resolve to AGGREGATE.
 */
export function inferLogisticsTypeFromCategory(
  categorySlug: string | null | undefined,
  productName?: string | null,
  unit?: string | null,
): LogisticsType | null {
  const slug = (categorySlug ?? '').toLowerCase();
  const name = (productName ?? '').toLowerCase();
  const haystack = `${slug} ${name}`;

  if (
    slug === 'rmc' ||
    slug.includes('ready-mix') ||
    slug.includes('ready_mix') ||
    name.includes('ready mix') ||
    name.includes('rmc')
  ) {
    return 'RMC';
  }

  if (
    slug === 'aggregates' ||
    slug === 'aggregate' ||
    slug === 'stone-chips' ||
    slug === 'stone_chips' ||
    slug === 'stone' ||
    slug === 'blue-metal' ||
    slug === 'blue_metal' ||
    haystack.includes('stone chip') ||
    haystack.includes('stone aggregate') ||
    haystack.includes('crushed stone') ||
    haystack.includes('blue metal') ||
    haystack.includes('coarse aggregate')
  ) {
    return 'AGGREGATE';
  }

  if (slug === 'sand' || slug.includes('m-sand') || name.includes('sand')) {
    return 'SAND';
  }

  if (slug === 'cement' || name.includes('cement')) return 'CEMENT';
  if (slug === 'bricks' || slug === 'brick' || name.includes('brick')) {
    return 'BRICKS';
  }
  if (slug === 'steel' || name.includes('tmt') || name.includes('steel')) {
    return 'STEEL';
  }
  if (
    slug === 'waterproofing' ||
    name.includes('waterproof') ||
    name.includes('dr fixit')
  ) {
    return 'WATERPROOFING';
  }
  if (slug === 'adhesives' || slug === 'adhesive' || name.includes('adhesive')) {
    return 'ADHESIVE';
  }
  if (slug === 'putty' || name.includes('putty')) {
    return 'WALL_PUTTY';
  }
  if (
    slug === 'wall-repair' ||
    slug === 'quick-repair' ||
    name.includes('quick repair')
  ) {
    return 'QUICK_REPAIR';
  }

  if (isMassUnit(unit) || isCubicMeterUnit(unit)) return 'HEAVY_MATERIAL';
  return null;
}

export function getMaterialProfile(
  logisticsType: string | null | undefined,
): MaterialTransportProfile | null {
  if (!logisticsType) return null;
  return MATERIAL_TRANSPORT_PROFILES[logisticsType] ?? null;
}

/**
 * 1 MT = 1000 kg is unit conversion, not a guessed product weight.
 * Tiny stored kg values on MT SKUs are treated as mis-seeded CFT density.
 */
export function resolveWeightPerUnitKg(input: {
  weightPerUnitKg: number | null;
  volumePerUnitCft: number | null;
  unit: string;
  logisticsType: string | null;
  name?: string | null;
}): { kg: number | null; source: 'product' | 'unit' | 'profile' | 'density' | null } {
  const profile = getMaterialProfile(input.logisticsType);
  const stored =
    input.weightPerUnitKg != null && input.weightPerUnitKg > 0
      ? input.weightPerUnitKg
      : null;

  if (isMassUnit(input.unit)) {
    if (stored != null && stored >= 250) {
      return { kg: stored, source: 'product' };
    }
    return { kg: 1000, source: 'unit' };
  }

  if (isCubicMeterUnit(input.unit)) {
    if (stored != null && stored >= 500) {
      return { kg: stored, source: 'product' };
    }
    return { kg: profile?.defaultWeightPerUnitKg ?? 2400, source: 'unit' };
  }

  if (stored != null) {
    return { kg: stored, source: 'product' };
  }

  if (
    input.volumePerUnitCft != null &&
    input.volumePerUnitCft > 0 &&
    profile?.bulkDensityKgPerCft
  ) {
    return {
      kg: Number(
        (input.volumePerUnitCft * profile.bulkDensityKgPerCft).toFixed(3),
      ),
      source: 'density',
    };
  }

  if (isCftUnit(input.unit) && profile?.bulkDensityKgPerCft) {
    return { kg: profile.bulkDensityKgPerCft, source: 'density' };
  }

  if (profile?.defaultWeightPerUnitKg != null) {
    return { kg: profile.defaultWeightPerUnitKg, source: 'profile' };
  }

  return { kg: null, source: null };
}

export function resolveVolumePerUnitCft(input: {
  volumePerUnitCft: number | null;
  unit: string;
  logisticsType: string | null;
}): number | null {
  const profile = getMaterialProfile(input.logisticsType);

  if (isMassUnit(input.unit)) {
    const density = profile?.bulkDensityKgPerCft;
    if (density && density > 0) {
      const fromDensity = Number((1000 / density).toFixed(3));
      const stored = input.volumePerUnitCft;
      if (stored == null || stored <= 2) return fromDensity;
      return stored;
    }
    return null;
  }

  if (input.volumePerUnitCft != null && input.volumePerUnitCft > 0) {
    return input.volumePerUnitCft;
  }
  if (isCftUnit(input.unit)) return 1;
  if (isCubicMeterUnit(input.unit)) {
    return profile?.defaultVolumePerUnitCft ?? null;
  }
  return null;
}

/**
 * Product-level allowedVehicleTypes override the category profile.
 * Profile applies only when the product has not been explicitly configured.
 * RMC is always forced to mixer regardless of product config.
 */
export function resolveProductVehicleRestrictions(input: {
  logisticsType: string | null;
  allowedVehicleTypes: VehicleType[] | null;
  preferredVehicleType: VehicleType | null;
}): {
  allowedVehicleTypes: VehicleType[] | null;
  preferredVehicleType: VehicleType | null;
  profile: MaterialTransportProfile | null;
  profileApplied: boolean;
} {
  const profile = getMaterialProfile(input.logisticsType);

  if (input.logisticsType === 'RMC') {
    const rmcOnly: VehicleType[] = [DeliveryVehicleType.RMC_TRANSIT_MIXER];
    const explicit = input.allowedVehicleTypes?.filter(
      (t) => t === DeliveryVehicleType.RMC_TRANSIT_MIXER,
    );
    return {
      allowedVehicleTypes: explicit && explicit.length > 0 ? explicit : rmcOnly,
      preferredVehicleType: DeliveryVehicleType.RMC_TRANSIT_MIXER,
      profile,
      profileApplied: true,
    };
  }

  if (input.allowedVehicleTypes && input.allowedVehicleTypes.length > 0) {
    return {
      allowedVehicleTypes: input.allowedVehicleTypes,
      preferredVehicleType:
        input.preferredVehicleType ?? profile?.preferredVehicleType ?? null,
      profile,
      profileApplied: false,
    };
  }

  if (!profile) {
    return {
      allowedVehicleTypes: null,
      preferredVehicleType: input.preferredVehicleType,
      profile: null,
      profileApplied: false,
    };
  }

  return {
    allowedVehicleTypes: profile.allowedVehicleTypes,
    preferredVehicleType:
      input.preferredVehicleType ?? profile.preferredVehicleType,
    profile,
    profileApplied: true,
  };
}

export function handlingKgPerMinute(logisticsType: string | null): number {
  return getMaterialProfile(logisticsType)?.handlingKgPerMinute ?? 200;
}

export function unloadingKgPerMinute(logisticsType: string | null): number {
  return getMaterialProfile(logisticsType)?.unloadingKgPerMinute ?? 160;
}

export function materialPreparationMinutes(
  logisticsType: string | null,
): number | null {
  return getMaterialProfile(logisticsType)?.preparationTimeMinutes ?? null;
}

export function materialLoadingBaseMinutes(
  logisticsType: string | null,
): number | null {
  return getMaterialProfile(logisticsType)?.loadingBaseTimeMinutes ?? null;
}

export function materialUnloadingBaseMinutes(
  logisticsType: string | null,
): number | null {
  return getMaterialProfile(logisticsType)?.unloadingBaseTimeMinutes ?? null;
}
