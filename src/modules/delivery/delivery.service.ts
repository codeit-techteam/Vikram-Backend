import { Injectable } from '@nestjs/common';
import {
  buildDeliveryMessage,
  buildDeliverySubtitle,
} from '../../common/delivery/customer-delivery.util';
import { FREE_DELIVERY_THRESHOLD, toMoney } from '../../common/shopping/pricing.util';
import { CoverageService } from '../coverage/coverage.service';
import type { CoverageStockItem } from '../coverage/coverage.types';
import {
  DeliveryEtaBodyDto,
  DeliveryEtaQueryDto,
  DeliveryEtaResponseDto,
} from './dto/delivery-eta.dto';
import { DeliveryPricingService } from './delivery-pricing.service';

/** ETA formula constants (minutes / speed). Tunable ops knobs. */
const PICKING_MINUTES = 5;
const PACKING_MINUTES = 5;
const LOADING_MINUTES = 5;
/** Average last-mile vehicle speed km/h inside city */
const AVG_VEHICLE_SPEED_KMH = 25;
/** Traffic multiplier applied to pure travel time */
const TRAFFIC_MULTIPLIER = 1.25;
/** Extra buffer minutes */
const TRAFFIC_BUFFER_MINUTES = 3;
/** Cap same-day window (minutes from now) */
const SAME_DAY_CUTOFF_MINUTES = 18 * 60;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly coverageService: CoverageService,
    private readonly deliveryPricingService: DeliveryPricingService,
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
      ? query.productIds.split(',').map((s) => s.trim()).filter(Boolean)
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

  async calculateEta(input: DeliveryEtaBodyDto): Promise<DeliveryEtaResponseDto> {
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
        deliveryMessage: buildDeliveryMessage(0, { serviceable: false }),
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
    const travelMinutes = Math.max(
      1,
      Math.ceil((distanceKm / AVG_VEHICLE_SPEED_KMH) * 60 * TRAFFIC_MULTIPLIER),
    );

    const estimatedMinutes =
      PICKING_MINUTES +
      PACKING_MINUTES +
      LOADING_MINUTES +
      travelMinutes +
      TRAFFIC_BUFFER_MINUTES;

    const now = new Date();
    const deliverAt = new Date(now.getTime() + estimatedMinutes * 60_000);
    const deliveryDay = this.resolveDeliveryDay(now, deliverAt, estimatedMinutes);
    const deliveringBy = this.formatTime(deliverAt);
    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

    let deliveryCharge = 0;
    let freeDelivery = false;
    let pricingMessage: string | undefined;
    let vehicleType: string | undefined;
    let vehicleDisplayName: string | undefined;
    let vehicleCount = 1;
    let totalWeightKg: number | null = null;
    let capacityUsed: number | null = null;
    let capacityLimit: number | null = null;

    try {
      const priced =
        items.length > 0
          ? await this.deliveryPricingService.calculateFromCart({
              cartItems: items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
              distanceKm,
              applyFreeBikeBenefit: false,
            })
          : await this.deliveryPricingService.calculateForCartQuantity({
              quantity: totalQty || 1,
              distanceKm,
              applyFreeBikeBenefit: false,
            });

      vehicleType = priced.vehicleType;
      vehicleDisplayName = priced.vehicleDisplayName;
      vehicleCount = priced.vehicleCount;
      totalWeightKg = priced.totalWeightKg;
      capacityUsed = priced.capacityUsed;
      capacityLimit = priced.capacityLimit;

      if (priced.requiresBulkQuote) {
        pricingMessage = priced.message;
      } else if (priced.available) {
        deliveryCharge = priced.listPrice;
      } else {
        pricingMessage = priced.message;
      }
    } catch {
      pricingMessage = 'Delivery pricing unavailable';
    }

    // Membership/threshold free delivery is applied at checkout, not ETA preview
    const cartSubtotalHint = 0;
    if (cartSubtotalHint >= FREE_DELIVERY_THRESHOLD) {
      deliveryCharge = 0;
      freeDelivery = true;
    }

    const serviceable = hub.inCoverage && (hub.canFulfill || items.length === 0);
    const preorder = deliveryDay === 'Tomorrow';

    return {
      serviceable,
      deliveryETA: estimatedMinutes,
      deliveryMessage: buildDeliveryMessage(estimatedMinutes, {
        deliveringBy,
        preorder,
        serviceable,
      }),
      deliveryDay,
      deliveringBy,
      deliveryCharge: toMoney(deliveryCharge),
      freeDelivery,
      deliveryVehicleType: vehicleType,
      deliveryVehicleDisplayName: vehicleDisplayName,
      deliveryVehicleCount: vehicleCount,
      deliveryDistanceKm: distanceKm,
      deliveryTotalWeightKg: totalWeightKg,
      deliveryCapacityUsed: capacityUsed,
      deliveryCapacityLimit: capacityLimit,
      message: pricingMessage
        ? pricingMessage
        : hub.canFulfill
          ? buildDeliverySubtitle(serviceable, { freeDelivery })
          : items.length > 0
            ? 'Some items may be unavailable at your location'
            : undefined,
    };
  }

  private unavailableResponse(message: string): DeliveryEtaResponseDto {
    return {
      serviceable: false,
      deliveryETA: 0,
      deliveryMessage: buildDeliveryMessage(0, { serviceable: false }),
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
