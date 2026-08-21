import type { DeliveryVehicleType } from '../delivery-pricing.constants';
import type {
  OrderLoadResult,
  VehicleSelectionResult,
} from './delivery-load.types';
import {
  handlingKgPerMinute,
  inferLogisticsTypeFromCategory,
  materialLoadingBaseMinutes,
  materialPreparationMinutes,
  materialUnloadingBaseMinutes,
  unloadingKgPerMinute,
  type LogisticsType,
} from './delivery-material-profile.logic';

export type { LogisticsType };
export { inferLogisticsTypeFromCategory };

export type EtaConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DeliveryEtaConfigView {
  defaultPickingMinutes: number;
  defaultPackingMinutes: number;
  defaultQueueMinutes: number;
  defaultSiteAccessMinutes: number;
  trafficMultiplier: number;
  trafficDataAvailable: boolean;
  fallbackSpeedKmh: number;
  rmcPlantPreparationMinutes: number;
  rmcMixerLoadingMinutes: number;
  rmcPouringMinutesPerCum: number;
  rmcSiteAccessMinutes: number;
  rmcQueueMinutes: number;
  confidenceHighSpreadMinutes: number;
  confidenceMediumSpreadMinutes: number;
  confidenceLowSpreadMinutes: number;
}

export interface DeliveryLoadingRuleView {
  logisticsType: string;
  model: string;
  minQuantity: number;
  maxQuantity: number | null;
  loadingMinutes: number;
  unloadingMinutes: number | null;
  preparationMinutes: number | null;
  loadingRateKgPerMinute: number | null;
  unloadingRateKgPerMinute: number | null;
  priority: number;
}

export interface VehicleTimingView {
  vehicleType: DeliveryVehicleType;
  avgLoadingTimeMinutes: number | null;
  avgUnloadingTimeMinutes: number | null;
  driverPreparationTimeMinutes: number | null;
  operationalBufferMinutes: number | null;
  avgSpeedKmh: number | null;
  supportsRmc: boolean;
  allowedLogisticsTypes: string[] | null;
}

export interface EtaTimingBreakdown {
  preparationMinutes: number;
  pickingMinutes: number;
  packingMinutes: number;
  vehicleAssignmentMinutes: number;
  queueMinutes: number;
  loadingMinutes: number;
  travelMinutes: number;
  unloadingMinutes: number;
  siteAccessMinutes: number;
  bufferMinutes: number;
  plantPreparationMinutes: number;
  mixerLoadingMinutes: number;
}

export interface DeliveryEtaCalculationResult {
  etaMinutes: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  etaConfidence: EtaConfidence;
  deliveryMessage: string;
  modeTitle: string;
  timing: EtaTimingBreakdown;
  logisticsType: string | null;
  trafficDataAvailable: boolean;
  isRmc: boolean;
  calculationVersion: number;
}

export const ETA_CALCULATION_VERSION = 2;

export const DEFAULT_ETA_CONFIG: DeliveryEtaConfigView = {
  defaultPickingMinutes: 5,
  defaultPackingMinutes: 5,
  defaultQueueMinutes: 0,
  defaultSiteAccessMinutes: 5,
  trafficMultiplier: 1.25,
  trafficDataAvailable: false,
  fallbackSpeedKmh: 25,
  rmcPlantPreparationMinutes: 25,
  rmcMixerLoadingMinutes: 15,
  rmcPouringMinutesPerCum: 8,
  rmcSiteAccessMinutes: 10,
  rmcQueueMinutes: 10,
  confidenceHighSpreadMinutes: 5,
  confidenceMediumSpreadMinutes: 15,
  confidenceLowSpreadMinutes: 30,
};

export function resolveDominantLogisticsType(
  load: OrderLoadResult,
  lineLogisticsTypes: Array<string | null>,
): string | null {
  const types = lineLogisticsTypes.filter((t): t is string => !!t);
  if (types.includes('RMC')) return 'RMC';
  if (types.length === 0) return null;
  // Prefer heaviest operational class when mixed
  const priority = [
    'RMC',
    'AGGREGATE',
    'SAND',
    'BULK_MATERIAL',
    'HEAVY_MATERIAL',
    'BRICKS',
    'STEEL',
    'CEMENT',
    'WALL_PUTTY',
    'WATERPROOFING',
    'ADHESIVE',
    'QUICK_REPAIR',
    'LIGHT_MATERIAL',
    'PARCEL',
  ];
  for (const p of priority) {
    if (types.includes(p)) return p;
  }
  return types[0] ?? null;
}

function handlingWeightKg(
  logisticsType: string | null,
  load: OrderLoadResult,
): number {
  if (load.hasWeightDimension && load.totalWeightKg > 0) {
    return load.totalWeightKg;
  }
  if (
    (logisticsType === 'AGGREGATE' ||
      logisticsType === 'SAND' ||
      logisticsType === 'HEAVY_MATERIAL' ||
      logisticsType === 'BULK_MATERIAL') &&
    load.hasVolumeDimension &&
    load.totalVolumeCft > 0
  ) {
    return load.totalVolumeCft * 40;
  }
  return 0;
}

function findLoadingRule(
  rules: DeliveryLoadingRuleView[],
  logisticsType: string | null,
  quantity = 1,
): DeliveryLoadingRuleView | null {
  if (!logisticsType) return null;
  const typed = rules.filter((r) => r.logisticsType === logisticsType);
  const inRange = typed.filter(
    (r) =>
      quantity >= r.minQuantity &&
      (r.maxQuantity == null || quantity <= r.maxQuantity),
  );
  const pool = inRange.length > 0 ? inRange : typed;
  return (
    [...pool].sort((a, b) => {
      const rateScore = (rule: DeliveryLoadingRuleView) =>
        rule.model === 'RATE' ? 0 : 1;
      return rateScore(a) - rateScore(b) || a.priority - b.priority;
    })[0] ?? null
  );
}

/** Conservative traffic factor when live Maps traffic is unavailable. */
export function timeOfDayTrafficFactor(now: Date = new Date()): number {
  const hour = now.getHours();
  if (hour >= 8 && hour < 11) return 1.12;
  if (hour >= 17 && hour < 21) return 1.16;
  if (hour >= 22 || hour < 6) return 0.92;
  return 1;
}

function toMinutes(hour: number, minute: number, meridiem?: string): number {
  let h = hour;
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h * 60 + minute;
}

export function parseWorkingHours(
  raw: string | null | undefined,
): { openMinutes: number; closeMinutes: number } | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .match(
      /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
    );
  if (!m) return null;
  const open = toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3] || undefined);
  const close = toMinutes(
    Number(m[4]),
    Number(m[5] ?? 0),
    m[6] || m[3] || undefined,
  );
  if (!Number.isFinite(open) || !Number.isFinite(close) || close === open) {
    return null;
  }
  return { openMinutes: open, closeMinutes: close };
}

export function minutesUntilWorkingHours(
  workingHours: string | null | undefined,
  now: Date = new Date(),
): number {
  const parsed = parseWorkingHours(workingHours);
  if (!parsed) return 0;
  const current = now.getHours() * 60 + now.getMinutes();
  const { openMinutes, closeMinutes } = parsed;
  const wrapsMidnight = closeMinutes < openMinutes;
  const isOpen = wrapsMidnight
    ? current >= openMinutes || current <= closeMinutes
    : current >= openMinutes && current <= closeMinutes;
  if (isOpen) return 0;
  if (current < openMinutes) return openMinutes - current;
  return 24 * 60 - current + openMinutes;
}

export function formatClockFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

function clampOperationalMinutes(
  minutes: number,
  cap: number,
  floor = 0,
): number {
  return Math.min(cap, Math.max(floor, minutes));
}

function formatMinutesRange(min: number, max: number): string {
  const fmt = (m: number) => {
    if (m < 60) return `${m} mins`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (rem === 0) return h === 1 ? '1 hr' : `${h} hrs`;
    const hLabel = h === 1 ? '1 hr' : `${h} hrs`;
    return `${hLabel} ${rem} mins`;
  };
  if (min === max) return fmt(min);
  // Compact hour ranges for bulk/RMC
  if (min >= 60 && max >= 60) {
    const minH = Math.round((min / 60) * 10) / 10;
    const maxH = Math.round((max / 60) * 10) / 10;
    if (minH === maxH) {
      return minH === 1 ? '~1 hr' : `~${minH} hrs`;
    }
    return `${minH}–${maxH} hrs`;
  }
  return `${fmt(min)} – ${fmt(max)}`;
}

export function buildVehicleModeTitle(
  vehicleType: DeliveryVehicleType | null,
  displayName: string | null,
  logisticsType: string | null,
): string {
  if (logisticsType === 'RMC' || vehicleType === 'RMC_TRANSIT_MIXER') {
    return 'Mixer Truck Delivery';
  }
  if (!vehicleType || !displayName) return 'Standard Delivery';
  if (vehicleType === 'BIKE') return 'Bike Delivery';
  if (vehicleType === 'FULL_TRUCK' || vehicleType === 'HEAVY_LOADER') {
    return 'Heavy Vehicle Delivery';
  }
  return `${displayName} Delivery`;
}

export function buildEtaRangeMessage(
  minMinutes: number,
  maxMinutes: number,
  _confidence: EtaConfidence,
): string {
  if (minMinutes <= 0 && maxMinutes <= 0) {
    return 'Delivery estimate unavailable';
  }
  const range = formatMinutesRange(
    Math.max(1, minMinutes),
    Math.max(Math.max(1, minMinutes), maxMinutes),
  );
  return `Estimated delivery ${range}`;
}

/**
 * Pure ETA calculator — product + quantity + vehicle + loading + travel + buffer.
 * Never returns a static "23 mins".
 */
export function calculateDeliveryEtaPure(input: {
  distanceKm: number;
  load: OrderLoadResult;
  selection: VehicleSelectionResult;
  logisticsType: string | null;
  etaConfig: DeliveryEtaConfigView;
  loadingRules: DeliveryLoadingRuleView[];
  vehicleTiming: VehicleTimingView | null;
  vehicleAvailabilityWaitMinutes?: number;
  now?: Date;
  hubClosedWaitMinutes?: number;
}): DeliveryEtaCalculationResult {
  const {
    distanceKm,
    load,
    selection,
    logisticsType,
    etaConfig,
    loadingRules,
    vehicleTiming,
    vehicleAvailabilityWaitMinutes = 0,
    now,
    hubClosedWaitMinutes = 0,
  } = input;

  const isRmc =
    logisticsType === 'RMC' || selection.vehicleType === 'RMC_TRANSIT_MIXER';
  const weightKg = handlingWeightKg(logisticsType, load);
  const rule = findLoadingRule(loadingRules, logisticsType, load.totalQuantity);
  const vehicleCount = Math.max(1, selection.vehicleCount || 1);

  const speedKmh =
    vehicleTiming?.avgSpeedKmh && vehicleTiming.avgSpeedKmh > 0
      ? vehicleTiming.avgSpeedKmh
      : etaConfig.fallbackSpeedKmh;

  const trafficFactor =
    (etaConfig.trafficMultiplier || 1) *
    (etaConfig.trafficDataAvailable || !now ? 1 : timeOfDayTrafficFactor(now));

  const oneWayTravel = Math.max(
    1,
    Math.ceil(
      (Math.max(0, distanceKm) / Math.max(8, speedKmh)) * 60 * trafficFactor,
    ),
  );
  // Extra trips include a return to hub between dispatches.
  const travelMinutes =
    oneWayTravel * vehicleCount + oneWayTravel * Math.max(0, vehicleCount - 1);

  let preparationMinutes = 0;
  let pickingMinutes = 0;
  let packingMinutes = 0;
  let loadingMinutes = 0;
  let unloadingMinutes = 0;
  let queueMinutes = etaConfig.defaultQueueMinutes;
  let siteAccessMinutes = etaConfig.defaultSiteAccessMinutes;
  let plantPreparationMinutes = 0;
  let mixerLoadingMinutes = 0;
  const bufferMinutes =
    vehicleTiming?.operationalBufferMinutes ?? (isRmc ? 20 : 10);

  const vehicleAssignmentMinutes =
    (vehicleTiming?.driverPreparationTimeMinutes ?? 5) +
    Math.max(0, vehicleAvailabilityWaitMinutes) +
    Math.max(0, hubClosedWaitMinutes);

  if (isRmc) {
    plantPreparationMinutes = etaConfig.rmcPlantPreparationMinutes;
    mixerLoadingMinutes = etaConfig.rmcMixerLoadingMinutes;
    preparationMinutes =
      (rule?.preparationMinutes ??
        materialPreparationMinutes(logisticsType) ??
        plantPreparationMinutes) +
      plantPreparationMinutes * Math.max(0, vehicleCount - 1) * 0.5;
    loadingMinutes = mixerLoadingMinutes * vehicleCount;
    unloadingMinutes = Math.max(
      rule?.unloadingMinutes ??
        materialUnloadingBaseMinutes(logisticsType) ??
        0,
      Math.ceil(load.totalQuantity * etaConfig.rmcPouringMinutesPerCum),
    );
    queueMinutes = Math.max(queueMinutes, etaConfig.rmcQueueMinutes);
    siteAccessMinutes = Math.max(
      siteAccessMinutes,
      etaConfig.rmcSiteAccessMinutes,
    );
    pickingMinutes = 0;
    packingMinutes = 0;
  } else {
    const profilePrep = materialPreparationMinutes(logisticsType);
    pickingMinutes = etaConfig.defaultPickingMinutes;
    packingMinutes = etaConfig.defaultPackingMinutes;
    preparationMinutes =
      rule?.preparationMinutes ??
      profilePrep ??
      pickingMinutes + packingMinutes;

    const baseLoading =
      rule?.loadingMinutes ??
      materialLoadingBaseMinutes(logisticsType) ??
      vehicleTiming?.avgLoadingTimeMinutes ??
      8;
    const loadRate =
      rule?.loadingRateKgPerMinute && rule.loadingRateKgPerMinute > 0
        ? rule.loadingRateKgPerMinute
        : handlingKgPerMinute(logisticsType);
    const loadingFromRate =
      weightKg > 0
        ? Math.ceil(weightKg / loadRate)
        : Math.max(0, Math.ceil(load.totalQuantity / 8) - 1);
    loadingMinutes = clampOperationalMinutes(
      (baseLoading + loadingFromRate) * vehicleCount,
      120 * vehicleCount,
      5 * vehicleCount,
    );

    const baseUnloading =
      rule?.unloadingMinutes ??
      materialUnloadingBaseMinutes(logisticsType) ??
      vehicleTiming?.avgUnloadingTimeMinutes ??
      Math.max(4, Math.ceil(baseLoading * 0.75));
    const unloadRate =
      rule?.unloadingRateKgPerMinute && rule.unloadingRateKgPerMinute > 0
        ? rule.unloadingRateKgPerMinute
        : unloadingKgPerMinute(logisticsType);
    const unloadingFromRate =
      weightKg > 0 ? Math.ceil(weightKg / unloadRate) : 0;
    unloadingMinutes = clampOperationalMinutes(
      (baseUnloading + unloadingFromRate) * vehicleCount,
      90 * vehicleCount,
      4 * vehicleCount,
    );
  }

  const etaMinutes = Math.max(
    1,
    Math.ceil(
      preparationMinutes +
        vehicleAssignmentMinutes +
        queueMinutes +
        loadingMinutes +
        travelMinutes +
        unloadingMinutes +
        siteAccessMinutes +
        bufferMinutes,
    ),
  );

  let etaConfidence: EtaConfidence = 'MEDIUM';
  if (
    isRmc ||
    vehicleCount > 1 ||
    load.totalQuantity >= 100 ||
    load.totalWeightKg >= 1000 ||
    logisticsType === 'AGGREGATE' ||
    logisticsType === 'SAND'
  ) {
    etaConfidence = 'LOW';
  } else if (
    distanceKm <= 5 &&
    load.missingLogisticsProductIds.length === 0 &&
    selection.mode === 'CAPACITY'
  ) {
    etaConfidence = 'HIGH';
  }

  const spread =
    etaConfidence === 'HIGH'
      ? etaConfig.confidenceHighSpreadMinutes
      : etaConfidence === 'LOW'
        ? etaConfig.confidenceLowSpreadMinutes
        : etaConfig.confidenceMediumSpreadMinutes;

  const etaMinMinutes = Math.max(1, etaMinutes - Math.floor(spread / 2));
  const etaMaxMinutes = etaMinutes + Math.ceil(spread / 2);

  const modeTitle = buildVehicleModeTitle(
    selection.vehicleType,
    selection.vehicleDisplayName,
    logisticsType,
  );

  return {
    etaMinutes,
    etaMinMinutes,
    etaMaxMinutes,
    etaConfidence,
    deliveryMessage: buildEtaRangeMessage(
      etaMinMinutes,
      etaMaxMinutes,
      etaConfidence,
    ),
    modeTitle,
    timing: {
      preparationMinutes: Math.ceil(preparationMinutes),
      pickingMinutes: Math.ceil(pickingMinutes),
      packingMinutes: Math.ceil(packingMinutes),
      vehicleAssignmentMinutes: Math.ceil(vehicleAssignmentMinutes),
      queueMinutes: Math.ceil(queueMinutes),
      loadingMinutes: Math.ceil(loadingMinutes),
      travelMinutes,
      unloadingMinutes: Math.ceil(unloadingMinutes),
      siteAccessMinutes: Math.ceil(siteAccessMinutes),
      bufferMinutes: Math.ceil(bufferMinutes),
      plantPreparationMinutes: Math.ceil(plantPreparationMinutes),
      mixerLoadingMinutes: Math.ceil(mixerLoadingMinutes),
    },
    logisticsType,
    trafficDataAvailable: etaConfig.trafficDataAvailable,
    isRmc,
    calculationVersion: ETA_CALCULATION_VERSION,
  };
}
