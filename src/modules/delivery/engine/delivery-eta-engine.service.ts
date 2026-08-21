import { Injectable } from '@nestjs/common';
import {
  DeliveryVehicleType,
  Prisma,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { decimalToNumber } from '../../../common/shopping/pricing.util';
import {
  calculateDeliveryEtaPure,
  DEFAULT_ETA_CONFIG,
  inferLogisticsTypeFromCategory,
  resolveDominantLogisticsType,
  type DeliveryEtaCalculationResult,
  type DeliveryEtaConfigView,
  type DeliveryLoadingRuleView,
  type VehicleTimingView,
} from './delivery-eta.logic';
import type {
  OrderLoadResult,
  ProductLogisticsSnapshot,
  VehicleSelectionResult,
} from './delivery-load.types';

@Injectable()
export class DeliveryEtaEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async getEtaConfig(): Promise<DeliveryEtaConfigView> {
    try {
      const row = await this.prisma.deliveryEtaConfig.findUnique({
        where: { configKey: 'DEFAULT' },
      });
      if (!row) return { ...DEFAULT_ETA_CONFIG };

      return {
        defaultPickingMinutes: decimalToNumber(row.defaultPickingMinutes),
        defaultPackingMinutes: decimalToNumber(row.defaultPackingMinutes),
        defaultQueueMinutes: decimalToNumber(row.defaultQueueMinutes),
        defaultSiteAccessMinutes: decimalToNumber(row.defaultSiteAccessMinutes),
        trafficMultiplier: decimalToNumber(row.trafficMultiplier),
        trafficDataAvailable: row.trafficDataAvailable,
        fallbackSpeedKmh: decimalToNumber(row.fallbackSpeedKmh),
        rmcPlantPreparationMinutes: decimalToNumber(
          row.rmcPlantPreparationMinutes,
        ),
        rmcMixerLoadingMinutes: decimalToNumber(row.rmcMixerLoadingMinutes),
        rmcPouringMinutesPerCum: decimalToNumber(row.rmcPouringMinutesPerCum),
        rmcSiteAccessMinutes: decimalToNumber(row.rmcSiteAccessMinutes),
        rmcQueueMinutes: decimalToNumber(row.rmcQueueMinutes),
        confidenceHighSpreadMinutes: row.confidenceHighSpreadMinutes,
        confidenceMediumSpreadMinutes: row.confidenceMediumSpreadMinutes,
        confidenceLowSpreadMinutes: row.confidenceLowSpreadMinutes,
      };
    } catch {
      return { ...DEFAULT_ETA_CONFIG };
    }
  }

  async updateEtaConfig(
    input: Partial<DeliveryEtaConfigView>,
    actor?: { id?: string; name?: string },
  ): Promise<DeliveryEtaConfigView> {
    const patch = this.toEtaConfigCreateData(input);
    await this.prisma.deliveryEtaConfig.upsert({
      where: { configKey: 'DEFAULT' },
      create: {
        configKey: 'DEFAULT',
        ...patch,
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
      update: {
        ...patch,
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
    });
    return this.getEtaConfig();
  }

  async listLoadingRules(
    activeOnly = true,
  ): Promise<DeliveryLoadingRuleView[]> {
    try {
      const rows = await this.prisma.deliveryLoadingRule.findMany({
        where: activeOnly ? { active: true } : undefined,
        orderBy: [{ logisticsType: 'asc' }, { priority: 'asc' }],
      });
      return rows.map((r) => ({
        logisticsType: r.logisticsType,
        model: r.model,
        minQuantity: decimalToNumber(r.minQuantity),
        maxQuantity:
          r.maxQuantity != null ? decimalToNumber(r.maxQuantity) : null,
        loadingMinutes: decimalToNumber(r.loadingMinutes),
        unloadingMinutes:
          r.unloadingMinutes != null
            ? decimalToNumber(r.unloadingMinutes)
            : null,
        preparationMinutes:
          r.preparationMinutes != null
            ? decimalToNumber(r.preparationMinutes)
            : null,
        loadingRateKgPerMinute:
          r.loadingRateKgPerMinute != null
            ? decimalToNumber(r.loadingRateKgPerMinute)
            : null,
        unloadingRateKgPerMinute:
          r.unloadingRateKgPerMinute != null
            ? decimalToNumber(r.unloadingRateKgPerMinute)
            : null,
        priority: r.priority,
      }));
    } catch {
      return [];
    }
  }

  async getVehicleTiming(
    vehicleType: DeliveryVehicleType | null,
  ): Promise<VehicleTimingView | null> {
    if (!vehicleType) return null;
    try {
      const row = await this.prisma.deliveryVehicleConfig.findUnique({
        where: { vehicleType },
      });
      if (!row) return null;
      const allowed = Array.isArray(row.allowedLogisticsTypes)
        ? (row.allowedLogisticsTypes as string[])
        : null;
      return {
        vehicleType: row.vehicleType,
        avgLoadingTimeMinutes:
          row.avgLoadingTimeMinutes != null
            ? decimalToNumber(row.avgLoadingTimeMinutes)
            : null,
        avgUnloadingTimeMinutes:
          row.avgUnloadingTimeMinutes != null
            ? decimalToNumber(row.avgUnloadingTimeMinutes)
            : null,
        driverPreparationTimeMinutes:
          row.driverPreparationTimeMinutes != null
            ? decimalToNumber(row.driverPreparationTimeMinutes)
            : null,
        operationalBufferMinutes:
          row.operationalBufferMinutes != null
            ? decimalToNumber(row.operationalBufferMinutes)
            : null,
        avgSpeedKmh:
          row.avgSpeedKmh != null ? decimalToNumber(row.avgSpeedKmh) : null,
        supportsRmc: row.supportsRmc,
        allowedLogisticsTypes: allowed,
      };
    } catch {
      return null;
    }
  }

  resolveLogisticsType(
    load: OrderLoadResult,
    products: ProductLogisticsSnapshot[],
  ): string | null {
    const byId = new Map(products.map((p) => [p.productId, p]));
    const types = load.lines.map((line) => {
      const product = byId.get(line.productId);
      return (
        product?.logisticsType ??
        inferLogisticsTypeFromCategory(
          product?.categorySlug ?? line.categorySlug,
          product?.name ?? line.name,
          product?.unit ?? line.unit,
        )
      );
    });
    return resolveDominantLogisticsType(load, types);
  }

  async calculate(input: {
    distanceKm: number;
    load: OrderLoadResult;
    selection: VehicleSelectionResult;
    products: ProductLogisticsSnapshot[];
    vehicleAvailabilityWaitMinutes?: number;
    hubClosedWaitMinutes?: number;
    now?: Date;
  }): Promise<DeliveryEtaCalculationResult> {
    const logisticsType = this.resolveLogisticsType(input.load, input.products);
    const [etaConfig, loadingRules, vehicleTiming] = await Promise.all([
      this.getEtaConfig(),
      this.listLoadingRules(true),
      this.getVehicleTiming(input.selection.vehicleType),
    ]);

    return calculateDeliveryEtaPure({
      distanceKm: input.distanceKm,
      load: input.load,
      selection: input.selection,
      logisticsType,
      etaConfig,
      loadingRules,
      vehicleTiming,
      vehicleAvailabilityWaitMinutes: input.vehicleAvailabilityWaitMinutes,
      hubClosedWaitMinutes: input.hubClosedWaitMinutes,
      now: input.now,
    });
  }

  async listVehicleTimings(): Promise<VehicleTimingView[]> {
    try {
      const rows = await this.prisma.deliveryVehicleConfig.findMany({
        where: { active: true },
      });
      return rows.map((row) => {
        const allowed = Array.isArray(row.allowedLogisticsTypes)
          ? (row.allowedLogisticsTypes as string[])
          : null;
        return {
          vehicleType: row.vehicleType,
          avgLoadingTimeMinutes:
            row.avgLoadingTimeMinutes != null
              ? decimalToNumber(row.avgLoadingTimeMinutes)
              : null,
          avgUnloadingTimeMinutes:
            row.avgUnloadingTimeMinutes != null
              ? decimalToNumber(row.avgUnloadingTimeMinutes)
              : null,
          driverPreparationTimeMinutes:
            row.driverPreparationTimeMinutes != null
              ? decimalToNumber(row.driverPreparationTimeMinutes)
              : null,
          operationalBufferMinutes:
            row.operationalBufferMinutes != null
              ? decimalToNumber(row.operationalBufferMinutes)
              : null,
          avgSpeedKmh:
            row.avgSpeedKmh != null ? decimalToNumber(row.avgSpeedKmh) : null,
          supportsRmc: row.supportsRmc,
          allowedLogisticsTypes: allowed,
        };
      });
    } catch {
      return [];
    }
  }

  private toEtaConfigCreateData(
    input: Partial<DeliveryEtaConfigView>,
  ): Omit<Prisma.DeliveryEtaConfigCreateInput, 'configKey'> {
    return {
      ...(input.defaultPickingMinutes != null
        ? { defaultPickingMinutes: input.defaultPickingMinutes }
        : {}),
      ...(input.defaultPackingMinutes != null
        ? { defaultPackingMinutes: input.defaultPackingMinutes }
        : {}),
      ...(input.defaultQueueMinutes != null
        ? { defaultQueueMinutes: input.defaultQueueMinutes }
        : {}),
      ...(input.defaultSiteAccessMinutes != null
        ? { defaultSiteAccessMinutes: input.defaultSiteAccessMinutes }
        : {}),
      ...(input.trafficMultiplier != null
        ? { trafficMultiplier: input.trafficMultiplier }
        : {}),
      ...(input.trafficDataAvailable != null
        ? { trafficDataAvailable: input.trafficDataAvailable }
        : {}),
      ...(input.fallbackSpeedKmh != null
        ? { fallbackSpeedKmh: input.fallbackSpeedKmh }
        : {}),
      ...(input.rmcPlantPreparationMinutes != null
        ? { rmcPlantPreparationMinutes: input.rmcPlantPreparationMinutes }
        : {}),
      ...(input.rmcMixerLoadingMinutes != null
        ? { rmcMixerLoadingMinutes: input.rmcMixerLoadingMinutes }
        : {}),
      ...(input.rmcPouringMinutesPerCum != null
        ? { rmcPouringMinutesPerCum: input.rmcPouringMinutesPerCum }
        : {}),
      ...(input.rmcSiteAccessMinutes != null
        ? { rmcSiteAccessMinutes: input.rmcSiteAccessMinutes }
        : {}),
      ...(input.rmcQueueMinutes != null
        ? { rmcQueueMinutes: input.rmcQueueMinutes }
        : {}),
      ...(input.confidenceHighSpreadMinutes != null
        ? { confidenceHighSpreadMinutes: input.confidenceHighSpreadMinutes }
        : {}),
      ...(input.confidenceMediumSpreadMinutes != null
        ? {
            confidenceMediumSpreadMinutes: input.confidenceMediumSpreadMinutes,
          }
        : {}),
      ...(input.confidenceLowSpreadMinutes != null
        ? { confidenceLowSpreadMinutes: input.confidenceLowSpreadMinutes }
        : {}),
    };
  }
}
