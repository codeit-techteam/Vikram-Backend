import type { DeliveryVehicleType } from '../../../../generated/prisma/client';

export type MultiVehicleMode = 'AUTO_SPLIT' | 'BULK_QUOTE' | 'REJECT';

export interface CartLoadItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface ProductLogisticsSnapshot {
  productId: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categorySlug: string | null;
  weightPerUnitKg: number | null;
  volumePerUnitCft: number | null;
  loadType: string | null;
  isTransportable: boolean;
  allowDecimalQuantity: boolean;
  preferredVehicleType: DeliveryVehicleType | null;
  allowedVehicleTypes: DeliveryVehicleType[] | null;
}

export interface LineLoadResult {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  weightKg: number;
  volumeCft: number;
  categoryId: string | null;
  categorySlug: string | null;
  allowedVehicleTypes: DeliveryVehicleType[] | null;
  preferredVehicleType: DeliveryVehicleType | null;
}

export interface OrderLoadResult {
  ok: boolean;
  message?: string;
  missingLogisticsProductIds: string[];
  totalWeightKg: number;
  totalVolumeCft: number;
  totalQuantity: number;
  lines: LineLoadResult[];
  /** Intersection of product vehicle restrictions (null = unrestricted). */
  allowedVehicleTypes: DeliveryVehicleType[] | null;
  preferredVehicleType: DeliveryVehicleType | null;
  hasWeightDimension: boolean;
  hasVolumeDimension: boolean;
}

export interface VehicleCapacityView {
  id: string;
  vehicleType: DeliveryVehicleType;
  displayName: string;
  maxWeightKg: number | null;
  maxVolumeCft: number | null;
  maxQuantity: number | null;
  capacityUtilizationLimit: number;
  usableWeightKg: number | null;
  usableVolumeCft: number | null;
  usableQuantity: number | null;
  priority: number;
  active: boolean;
  hasConfiguredCapacity: boolean;
  allowedProductCategories: string[] | null;
}

export interface VehicleSelectionResult {
  ok: boolean;
  message?: string;
  mode: 'CAPACITY' | 'QTY_TIER_FALLBACK' | 'MULTI_VEHICLE' | 'BULK_QUOTE' | 'UNAVAILABLE';
  vehicleType: DeliveryVehicleType | null;
  vehicleDisplayName: string | null;
  vehicleConfigId: string | null;
  vehicleCount: number;
  capacityUsed: number | null;
  capacityLimit: number | null;
  capacityUtilizationPercent: number | null;
  requiresBulkQuote: boolean;
  multiVehicle: boolean;
  eligibleVehicleTypes: DeliveryVehicleType[];
}
