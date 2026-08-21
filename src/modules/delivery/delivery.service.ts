import { Injectable, Logger } from '@nestjs/common';
import { buildDeliverySubtitle } from '../../common/delivery/customer-delivery.util';
import {
  FREE_DELIVERY_THRESHOLD,
  toMoney,
} from '../../common/shopping/pricing.util';
import { CoverageService } from '../coverage/coverage.service';
import type { CoverageStockItem } from '../coverage/coverage.types';
import {
  DeliveryEtaBodyDto,
  DeliveryEtaQueryDto,
  DeliveryEtaResponseDto,
} from './dto/delivery-eta.dto';
import { DeliveryPricingService } from './delivery-pricing.service';
import { DeliveryEtaEngineService } from './engine/delivery-eta-engine.service';
import {
  calculateDeliveryEtaPure,
  DEFAULT_ETA_CONFIG,
  formatClockFromMinutes,
  minutesUntilWorkingHours,
  parseWorkingHours,
} from './engine/delivery-eta.logic';
import type { DeliveryEtaCalculationResult } from './engine/delivery-eta.logic';
import { DeliveryLoadService } from './engine/delivery-load.service';
import type {
  OrderLoadResult,
  ProductLogisticsSnapshot,
  VehicleSelectionResult,
} from './engine/delivery-load.types';
import { selectVehicleForLoad } from './engine/delivery-vehicle-selection.logic';
import { DeliveryVehicleSelectionService } from './engine/delivery-vehicle-selection.service';

/** Cap same-day window (minutes from now) */
const SAME_DAY_CUTOFF_MINUTES = 18 * 60;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly coverageService: CoverageService,
    private readonly deliveryPricingService: DeliveryPricingService,
    private readonly loadService: DeliveryLoadService,
    private readonly vehicleSelection: DeliveryVehicleSelectionService,
    private readonly etaEngine: DeliveryEtaEngineService,
  ) {}

  async calculateEtaFromQuery(
    query: DeliveryEtaQueryDto,
  ): Promise<DeliveryEtaResponseDto> {
    const latitude = query.latitude ?? query.lat;
    const longitude = query.longitude ?? query.lng;
    if (latitude == null || longitude == null) {
      return this.unavailableResponse('latitude and longitude are required');
    }

    const productIds = query.productIds
      ? query.productIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const quantities = query.quantities
      ? query.quantities.split(',').map((s) => Number(s.trim()) || 1)
      : [];

    const cartItems = productIds.map((productId, index) => ({
      productId,
      quantity: quantities[index] ?? 1,
    }));

    return this.calculateEta({
      latitude,
      longitude,
      pincode: query.pincode,
      cartItems,
    });
  }

  async calculateEta(
    input: DeliveryEtaBodyDto,
  ): Promise<DeliveryEtaResponseDto> {
    const items: CoverageStockItem[] = (input.cartItems ?? []).map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));

    const hub = await this.coverageService.findNearestHub(
      {
        latitude: input.latitude,
        longitude: input.longitude,
        pincode: input.pincode,
      },
      items,
    );

    if (!hub || !hub.inCoverage) {
      return {
        serviceable: false,
        deliveryETA: 0,
        deliveryMessage: 'Delivery unavailable at this location',
        deliveryDay: 'Unavailable',
        deliveringBy: null,
        deliveryCharge: 0,
        freeDelivery: false,
        message: hub
          ? 'Delivery unavailable at this location'
          : 'No delivery coverage found near this location',
      };
    }

    const distanceKm = Number.isFinite(hub.distanceKm) ? hub.distanceKm : 0;
    const now = new Date();
    const hubClosedWaitMinutes = minutesUntilWorkingHours(
      hub.workingHours,
      now,
    );

    let deliveryCharge = 0;
    let freeDelivery = false;
    let pricingMessage: string | undefined;
    let vehicleType: string | undefined;
    let vehicleDisplayName: string | undefined;
    let vehicleImageUrl: string | undefined;
    let vehicleCount = 1;
    let totalWeightKg: number | null = null;
    let totalVolumeCft: number | null = null;
    let capacityUsed: number | null = null;
    let capacityLimit: number | null = null;
    let modeTitle: string | undefined;
    let logisticsType: string | null = null;
    let selectionReason: string | undefined;
    let etaMinutes = 0;
    let etaMinMinutes = 0;
    let etaMaxMinutes = 0;
    let etaConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let deliveryMessage = 'Add items to see a delivery estimate';
    let timing: DeliveryEtaResponseDto['timing'] | undefined;
    let selection: VehicleSelectionResult | null = null;

    if (items.length === 0) {
      modeTitle = 'Delivery estimate';
      etaConfidence = 'LOW';
    } else {
      try {
        const products = await this.loadService.loadProductsForCart(
          items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        );
        const load = this.loadService.calculateOrderLoad(
          products,
          items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        );
        totalWeightKg = load.totalWeightKg || null;
        totalVolumeCft = load.totalVolumeCft || null;

        selection = await this.vehicleSelection.selectVehicleForEstimate(load);
        selectionReason = selection.reason ?? undefined;
        vehicleType = selection.vehicleType ?? undefined;
        vehicleDisplayName = selection.vehicleDisplayName ?? undefined;
        vehicleImageUrl = selection.vehicleImageUrl ?? undefined;
        vehicleCount = Math.max(1, selection.vehicleCount || 1);
        capacityUsed = selection.capacityUsed;
        capacityLimit = selection.capacityLimit;

        if (selection.vehicleType) {
          const eta = await this.computeEtaSafe({
            distanceKm,
            load,
            selection,
            products,
            hubClosedWaitMinutes,
            now,
          });
          etaMinutes = eta.etaMinutes;
          etaMinMinutes = eta.etaMinMinutes;
          etaMaxMinutes = eta.etaMaxMinutes;
          etaConfidence = eta.etaConfidence;
          deliveryMessage = eta.deliveryMessage;
          modeTitle = eta.modeTitle;
          logisticsType = eta.logisticsType;
          timing = eta.timing;
          vehicleDisplayName =
            vehicleDisplayName ?? selection.vehicleDisplayName ?? undefined;
        } else {
          deliveryMessage =
            selection.message ?? 'No eligible vehicle exists for this order';
          modeTitle = 'Delivery vehicle unassigned';
        }

        if (selection.vehicleType) {
          try {
            const priced = await this.deliveryPricingService.calculateCharge({
              vehicleType: selection.vehicleType,
              distanceKm,
              applyFreeBikeBenefit: false,
              vehicleCount: selection.vehicleCount,
              totalWeightKg: load.totalWeightKg,
              totalVolumeCft: load.totalVolumeCft,
              totalQuantity: load.totalQuantity,
              capacityUsed: selection.capacityUsed,
              capacityLimit: selection.capacityLimit,
              capacityUtilizationPercent: selection.capacityUtilizationPercent,
              selectionMode: selection.mode,
              selectionReason: selection.reason,
            });
            if (priced.available) {
              deliveryCharge = priced.listPrice;
            } else {
              pricingMessage = priced.message;
            }
          } catch (err) {
            this.logger.warn(
              `Delivery pricing failed after ETA: ${err instanceof Error ? err.message : String(err)}`,
            );
            pricingMessage = 'Delivery pricing unavailable';
          }
        } else if (selection.message) {
          pricingMessage = selection.message;
        }
      } catch (err) {
        this.logger.error(
          `Delivery ETA failed: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        if (etaMinutes <= 0) {
          deliveryMessage =
            err instanceof Error && err.message
              ? err.message
              : 'Delivery estimate unavailable';
        }
      }
    }

    if (
      hubClosedWaitMinutes > 0 &&
      etaMinutes > 0 &&
      !/estimated delivery/i.test(deliveryMessage)
    ) {
      const parsed = parseWorkingHours(hub.workingHours);
      const openLabel = parsed
        ? formatClockFromMinutes(parsed.openMinutes)
        : 'opening time';
      const nextDay = hubClosedWaitMinutes >= 12 * 60;
      deliveryMessage = nextDay
        ? `Next available delivery: tomorrow ${openLabel}`
        : `Next available delivery: ${openLabel}`;
    }

    const cartSubtotalHint = 0;
    if (cartSubtotalHint >= FREE_DELIVERY_THRESHOLD) {
      deliveryCharge = 0;
      freeDelivery = true;
    }

    const deliverAt = new Date(now.getTime() + etaMinutes * 60_000);
    const deliveryDay = this.resolveDeliveryDay(now, deliverAt, etaMinutes);
    const deliveringBy = etaMinutes > 0 ? this.formatTime(deliverAt) : null;
    const vehicleReady = Boolean(selection?.vehicleType) || items.length === 0;
    const serviceable = hub.inCoverage && vehicleReady;

    return {
      serviceable,
      deliveryETA: etaMinutes,
      etaMinMinutes,
      etaMaxMinutes,
      etaConfidence,
      deliveryMessage,
      deliveryModeTitle: modeTitle,
      deliveryDay,
      deliveringBy,
      deliveryCharge: toMoney(deliveryCharge),
      freeDelivery,
      deliveryVehicleType: vehicleType,
      deliveryVehicleDisplayName: vehicleDisplayName,
      deliveryVehicleImageUrl: vehicleImageUrl,
      deliveryVehicleCount: vehicleCount,
      deliveryDistanceKm: distanceKm,
      deliveryTotalWeightKg: totalWeightKg,
      deliveryTotalVolumeCft: totalVolumeCft,
      deliveryCapacityUsed: capacityUsed,
      deliveryCapacityLimit: capacityLimit,
      deliveryLogisticsType: logisticsType ?? undefined,
      deliverySelectionReason: selectionReason,
      timing,
      trafficDataAvailable: false,
      calculationVersion: 2,
      fulfillmentSource: {
        id: hub.id,
        type: logisticsType === 'RMC' ? 'RMC_PLANT' : 'HUB',
        name: hub.name,
      },
      message: pricingMessage
        ? pricingMessage
        : hub.canFulfill
          ? buildDeliverySubtitle(serviceable, { freeDelivery })
          : items.length > 0
            ? 'Some items may be sourced from a nearby warehouse'
            : undefined,
    };
  }

  private async computeEtaSafe(input: {
    distanceKm: number;
    load: OrderLoadResult;
    selection: VehicleSelectionResult;
    products: ProductLogisticsSnapshot[];
    hubClosedWaitMinutes: number;
    now: Date;
  }): Promise<DeliveryEtaCalculationResult> {
    try {
      return await this.etaEngine.calculate({
        distanceKm: input.distanceKm,
        load: input.load,
        selection: input.selection,
        products: input.products,
        hubClosedWaitMinutes: input.hubClosedWaitMinutes,
        now: input.now,
      });
    } catch (err) {
      this.logger.warn(
        `ETA engine fallback used: ${err instanceof Error ? err.message : String(err)}`,
      );
      const logisticsType = this.etaEngine.resolveLogisticsType(
        input.load,
        input.products,
      );
      return calculateDeliveryEtaPure({
        distanceKm: input.distanceKm,
        load: input.load,
        selection: input.selection,
        logisticsType,
        etaConfig: DEFAULT_ETA_CONFIG,
        loadingRules: [],
        vehicleTiming: null,
        hubClosedWaitMinutes: input.hubClosedWaitMinutes,
        now: input.now,
      });
    }
  }

  /**
   * Product-listing preview using the same engine as /delivery/eta.
   * Distance is reused (no map API). Quantity is 1 sellable unit.
   */
  async previewCatalogEtas(
    products: ProductLogisticsSnapshot[],
    distanceKm: number,
  ): Promise<Map<string, DeliveryEtaCalculationResult>> {
    const results = new Map<string, DeliveryEtaCalculationResult>();
    if (
      products.length === 0 ||
      !Number.isFinite(distanceKm) ||
      distanceKm < 0
    ) {
      return results;
    }

    const [etaConfig, loadingRules, vehicleTimings, configs, engine] =
      await Promise.all([
        this.etaEngine.getEtaConfig(),
        this.etaEngine.listLoadingRules(true),
        this.etaEngine.listVehicleTimings(),
        this.vehicleSelection.listVehicleConfigs(true),
        this.vehicleSelection.getEngineConfig(),
      ]);
    const timingByType = new Map(vehicleTimings.map((t) => [t.vehicleType, t]));

    for (const product of products) {
      if (!product.isTransportable) continue;
      try {
        const load = this.loadService.calculateOrderLoad(
          [product],
          [{ productId: product.productId, quantity: 1 }],
        );
        if (!load.ok) continue;
        const selection = selectVehicleForLoad(load, configs, engine);
        if (!selection.ok || !selection.vehicleType) continue;
        const logisticsType = this.etaEngine.resolveLogisticsType(load, [
          product,
        ]);
        results.set(
          product.productId,
          calculateDeliveryEtaPure({
            distanceKm,
            load,
            selection,
            logisticsType,
            etaConfig,
            loadingRules,
            vehicleTiming: timingByType.get(selection.vehicleType) ?? null,
          }),
        );
      } catch {
        continue;
      }
    }

    return results;
  }

  private unavailableResponse(message: string): DeliveryEtaResponseDto {
    return {
      serviceable: false,
      deliveryETA: 0,
      etaMinMinutes: 0,
      etaMaxMinutes: 0,
      etaConfidence: 'LOW',
      deliveryMessage: 'Delivery unavailable at this location',
      deliveryDay: 'Unavailable',
      deliveringBy: null,
      deliveryCharge: 0,
      freeDelivery: false,
      message,
    };
  }

  private resolveDeliveryDay(
    now: Date,
    deliverAt: Date,
    estimatedMinutes: number,
  ): 'Today' | 'Tomorrow' | 'Later' {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    if (
      deliverAt.getTime() <= endOfToday.getTime() &&
      estimatedMinutes < SAME_DAY_CUTOFF_MINUTES
    ) {
      return 'Today';
    }

    const endOfTomorrow = new Date(endOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    if (deliverAt.getTime() <= endOfTomorrow.getTime()) {
      return 'Tomorrow';
    }
    return 'Later';
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}
