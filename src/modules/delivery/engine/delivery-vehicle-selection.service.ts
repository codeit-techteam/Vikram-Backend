import { Injectable } from '@nestjs/common';
import {
  DeliveryVehicleType,
  Prisma,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { decimalToNumber } from '../../../common/shopping/pricing.util';
import {
  DELIVERY_VEHICLE_DISPLAY_NAMES,
} from '../delivery-pricing.constants';
import { selectVehicleForLoad } from './delivery-vehicle-selection.logic';
import type {
  MultiVehicleMode,
  OrderLoadResult,
  VehicleCapacityView,
  VehicleSelectionResult,
} from './delivery-load.types';

@Injectable()
export class DeliveryVehicleSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getEngineConfig() {
    const existing = await this.prisma.deliveryEngineConfig.findUnique({
      where: { configKey: 'DEFAULT' },
    });
    if (existing) {
      return {
        id: existing.id,
        configKey: existing.configKey,
        multiVehicleMode: existing.multiVehicleMode as MultiVehicleMode,
        enablePartialDelivery: existing.enablePartialDelivery,
        qtyTierFallbackEnabled: existing.qtyTierFallbackEnabled,
        bulkOrderThresholdKg:
          existing.bulkOrderThresholdKg != null
            ? decimalToNumber(existing.bulkOrderThresholdKg)
            : null,
        bulkOrderThresholdCft:
          existing.bulkOrderThresholdCft != null
            ? decimalToNumber(existing.bulkOrderThresholdCft)
            : null,
        bulkOrderThresholdQty: existing.bulkOrderThresholdQty,
        updatedBy: existing.updatedBy,
        updatedByName: existing.updatedByName,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    const created = await this.prisma.deliveryEngineConfig.create({
      data: {
        configKey: 'DEFAULT',
        multiVehicleMode: 'BULK_QUOTE',
        enablePartialDelivery: false,
        qtyTierFallbackEnabled: true,
      },
    });

    return {
      id: created.id,
      configKey: created.configKey,
      multiVehicleMode: created.multiVehicleMode as MultiVehicleMode,
      enablePartialDelivery: created.enablePartialDelivery,
      qtyTierFallbackEnabled: created.qtyTierFallbackEnabled,
      bulkOrderThresholdKg: null,
      bulkOrderThresholdCft: null,
      bulkOrderThresholdQty: null,
      updatedBy: created.updatedBy,
      updatedByName: created.updatedByName,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateEngineConfig(
    input: {
      multiVehicleMode?: MultiVehicleMode;
      enablePartialDelivery?: boolean;
      qtyTierFallbackEnabled?: boolean;
      bulkOrderThresholdKg?: number | null;
      bulkOrderThresholdCft?: number | null;
      bulkOrderThresholdQty?: number | null;
    },
    actor?: { id?: string; name?: string },
  ) {
    await this.getEngineConfig();
    const updated = await this.prisma.deliveryEngineConfig.update({
      where: { configKey: 'DEFAULT' },
      data: {
        ...(input.multiVehicleMode != null
          ? { multiVehicleMode: input.multiVehicleMode }
          : {}),
        ...(input.enablePartialDelivery != null
          ? { enablePartialDelivery: input.enablePartialDelivery }
          : {}),
        ...(input.qtyTierFallbackEnabled != null
          ? { qtyTierFallbackEnabled: input.qtyTierFallbackEnabled }
          : {}),
        ...(input.bulkOrderThresholdKg !== undefined
          ? { bulkOrderThresholdKg: input.bulkOrderThresholdKg }
          : {}),
        ...(input.bulkOrderThresholdCft !== undefined
          ? { bulkOrderThresholdCft: input.bulkOrderThresholdCft }
          : {}),
        ...(input.bulkOrderThresholdQty !== undefined
          ? { bulkOrderThresholdQty: input.bulkOrderThresholdQty }
          : {}),
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
    });
    return this.getEngineConfig();
  }

  mapConfig(row: {
    id: string;
    vehicleType: DeliveryVehicleType;
    displayName: string;
    maxWeightKg: Prisma.Decimal | number | null;
    maxVolumeCft: Prisma.Decimal | number | null;
    maxQuantity: Prisma.Decimal | number | null;
    capacityUtilizationLimit: Prisma.Decimal | number;
    priority: number;
    active: boolean;
    allowedProductCategories: unknown;
    supportsRmc?: boolean;
    allowedLogisticsTypes?: unknown;
  }): VehicleCapacityView {
    const util = decimalToNumber(row.capacityUtilizationLimit);
    const maxWeight =
      row.maxWeightKg != null ? decimalToNumber(row.maxWeightKg) : null;
    const maxVolume =
      row.maxVolumeCft != null ? decimalToNumber(row.maxVolumeCft) : null;
    const maxQty =
      row.maxQuantity != null ? decimalToNumber(row.maxQuantity) : null;
    const factor = util / 100;

    const categories = Array.isArray(row.allowedProductCategories)
      ? (row.allowedProductCategories as string[])
      : null;
    const logisticsTypes = Array.isArray(row.allowedLogisticsTypes)
      ? (row.allowedLogisticsTypes as string[])
      : null;

    return {
      id: row.id,
      vehicleType: row.vehicleType,
      displayName: row.displayName,
      maxWeightKg: maxWeight,
      maxVolumeCft: maxVolume,
      maxQuantity: maxQty,
      capacityUtilizationLimit: util,
      usableWeightKg: maxWeight != null ? Number((maxWeight * factor).toFixed(3)) : null,
      usableVolumeCft: maxVolume != null ? Number((maxVolume * factor).toFixed(3)) : null,
      usableQuantity: maxQty != null ? Number((maxQty * factor).toFixed(3)) : null,
      priority: row.priority,
      active: row.active,
      hasConfiguredCapacity:
        maxWeight != null || maxVolume != null || maxQty != null,
      allowedProductCategories: categories,
      supportsRmc: row.supportsRmc === true,
      allowedLogisticsTypes: logisticsTypes,
    };
  }

  async listVehicleConfigs(activeOnly = false): Promise<VehicleCapacityView[]> {
    const rows = await this.prisma.deliveryVehicleConfig.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { priority: 'asc' },
    });
    return rows.map((r) => this.mapConfig(r));
  }

  async getVehicleConfig(vehicleType: DeliveryVehicleType) {
    const row = await this.prisma.deliveryVehicleConfig.findUnique({
      where: { vehicleType },
    });
    return row ? this.mapConfig(row) : null;
  }

  async updateVehicleConfig(
    vehicleType: DeliveryVehicleType,
    input: {
      displayName?: string;
      maxWeightKg?: number | null;
      maxVolumeCft?: number | null;
      maxQuantity?: number | null;
      capacityUtilizationLimit?: number;
      priority?: number;
      active?: boolean;
      allowedProductCategories?: string[] | null;
      avgLoadingTimeMinutes?: number | null;
      avgUnloadingTimeMinutes?: number | null;
      driverPreparationTimeMinutes?: number | null;
      operationalBufferMinutes?: number | null;
      avgSpeedKmh?: number | null;
      supportsRmc?: boolean;
      supportsBulkMaterial?: boolean;
      allowedLogisticsTypes?: string[] | null;
    },
    actor?: { id?: string },
  ) {
    const existing = await this.prisma.deliveryVehicleConfig.findUnique({
      where: { vehicleType },
    });
    if (!existing) {
      const created = await this.prisma.deliveryVehicleConfig.create({
        data: {
          vehicleType,
          displayName:
            input.displayName ?? DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType],
          maxWeightKg: input.maxWeightKg ?? null,
          maxVolumeCft: input.maxVolumeCft ?? null,
          maxQuantity: input.maxQuantity ?? null,
          capacityUtilizationLimit: input.capacityUtilizationLimit ?? 100,
          priority: input.priority ?? 100,
          active: input.active ?? true,
          allowedProductCategories:
            input.allowedProductCategories === undefined ||
            input.allowedProductCategories === null
              ? Prisma.JsonNull
              : input.allowedProductCategories,
          avgLoadingTimeMinutes: input.avgLoadingTimeMinutes ?? null,
          avgUnloadingTimeMinutes: input.avgUnloadingTimeMinutes ?? null,
          driverPreparationTimeMinutes:
            input.driverPreparationTimeMinutes ?? null,
          operationalBufferMinutes: input.operationalBufferMinutes ?? null,
          avgSpeedKmh: input.avgSpeedKmh ?? null,
          supportsRmc: input.supportsRmc ?? false,
          supportsBulkMaterial: input.supportsBulkMaterial ?? false,
          allowedLogisticsTypes:
            input.allowedLogisticsTypes === undefined ||
            input.allowedLogisticsTypes === null
              ? Prisma.JsonNull
              : input.allowedLogisticsTypes,
          createdBy: actor?.id ?? null,
          updatedBy: actor?.id ?? null,
        },
      });
      return this.mapConfig(created);
    }

    const updated = await this.prisma.deliveryVehicleConfig.update({
      where: { vehicleType },
      data: {
        ...(input.displayName != null ? { displayName: input.displayName } : {}),
        ...(input.maxWeightKg !== undefined
          ? { maxWeightKg: input.maxWeightKg }
          : {}),
        ...(input.maxVolumeCft !== undefined
          ? { maxVolumeCft: input.maxVolumeCft }
          : {}),
        ...(input.maxQuantity !== undefined
          ? { maxQuantity: input.maxQuantity }
          : {}),
        ...(input.capacityUtilizationLimit != null
          ? { capacityUtilizationLimit: input.capacityUtilizationLimit }
          : {}),
        ...(input.priority != null ? { priority: input.priority } : {}),
        ...(input.active != null ? { active: input.active } : {}),
        ...(input.allowedProductCategories !== undefined
          ? {
              allowedProductCategories:
                input.allowedProductCategories === null
                  ? Prisma.JsonNull
                  : input.allowedProductCategories,
            }
          : {}),
        ...(input.avgLoadingTimeMinutes !== undefined
          ? { avgLoadingTimeMinutes: input.avgLoadingTimeMinutes }
          : {}),
        ...(input.avgUnloadingTimeMinutes !== undefined
          ? { avgUnloadingTimeMinutes: input.avgUnloadingTimeMinutes }
          : {}),
        ...(input.driverPreparationTimeMinutes !== undefined
          ? {
              driverPreparationTimeMinutes:
                input.driverPreparationTimeMinutes,
            }
          : {}),
        ...(input.operationalBufferMinutes !== undefined
          ? { operationalBufferMinutes: input.operationalBufferMinutes }
          : {}),
        ...(input.avgSpeedKmh !== undefined
          ? { avgSpeedKmh: input.avgSpeedKmh }
          : {}),
        ...(input.supportsRmc != null ? { supportsRmc: input.supportsRmc } : {}),
        ...(input.supportsBulkMaterial != null
          ? { supportsBulkMaterial: input.supportsBulkMaterial }
          : {}),
        ...(input.allowedLogisticsTypes !== undefined
          ? {
              allowedLogisticsTypes:
                input.allowedLogisticsTypes === null
                  ? Prisma.JsonNull
                  : input.allowedLogisticsTypes,
            }
          : {}),
        updatedBy: actor?.id ?? null,
      },
    });
    return this.mapConfig(updated);
  }

  /**
   * Select smallest suitable vehicle for load.
   * Capacities must come from Admin config — never invent kg/CFT.
   * When no capacities are configured, optionally fall back to qty tiers.
   */
  async selectVehicle(
    load: OrderLoadResult,
  ): Promise<VehicleSelectionResult> {
    const engine = await this.getEngineConfig();
    const configs = await this.listVehicleConfigs(true);
    return selectVehicleForLoad(load, configs, engine);
  }

  /**
   * Same vehicle as pricing, but AUTO_SPLIT so ETA can still be produced
   * when the order needs multiple trips instead of failing as a bulk quote.
   */
  async selectVehicleForEstimate(
    load: OrderLoadResult,
  ): Promise<VehicleSelectionResult> {
    const engine = await this.getEngineConfig();
    const configs = await this.listVehicleConfigs(true);
    const estimated = selectVehicleForLoad(load, configs, {
      ...engine,
      multiVehicleMode: 'AUTO_SPLIT',
    });
    if (estimated.ok) return estimated;
    return selectVehicleForLoad(load, configs, engine);
  }
}
