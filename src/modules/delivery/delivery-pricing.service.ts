import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryPricingStatus,
  DeliveryVehicleType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber, toMoney } from '../../common/shopping/pricing.util';
import {
  DEFAULT_COMPANY_ABSORPTION_INR,
  DEFAULT_FREE_BIKE_DELIVERIES,
  DELIVERY_VEHICLE_DISPLAY_NAMES,
  formatDistanceSlab,
  resolveDeliveryVehicleForQuantity,
} from './delivery-pricing.constants';

export interface CalculatedDeliveryCharge {
  available: boolean;
  message?: string;
  vehicleType: DeliveryVehicleType;
  vehicleDisplayName: string;
  distanceKm: number;
  /** List price from active pricing rule (before free-bike benefit). */
  listPrice: number;
  /** Charge charged to customer after benefits (may be 0). */
  deliveryCharge: number;
  currency: string;
  pricingRuleId: string | null;
  pricingVersion: number | null;
  distanceFromKm: number | null;
  distanceToKm: number | null;
  distanceSlab: string | null;
  freeDeliveryApplied: boolean;
  companyAbsorbedDelivery: number;
  freeBikeDeliveriesRemaining: number | null;
  freeBikeDeliveriesAllowed: number | null;
  freeBikeDeliveriesUsed: number | null;
}

@Injectable()
export class DeliveryPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(params?: {
    vehicleType?: DeliveryVehicleType;
    status?: DeliveryPricingStatus;
  }) {
    const where: Prisma.DeliveryPricingRuleWhereInput = {};
    if (params?.vehicleType) where.vehicleType = params.vehicleType;
    if (params?.status) where.status = params.status;

    const rules = await this.prisma.deliveryPricingRule.findMany({
      where,
      orderBy: [{ vehicleType: 'asc' }, { distanceToKm: 'asc' }],
    });

    return rules.map((r) => this.mapRule(r));
  }

  async getRuleById(id: string) {
    const rule = await this.prisma.deliveryPricingRule.findUnique({
      where: { id },
    });
    if (!rule) throw new NotFoundException('Delivery pricing rule not found');
    return this.mapRule(rule);
  }

  async getSummary() {
    const [rules, benefitConfig, lastUpdated] = await Promise.all([
      this.prisma.deliveryPricingRule.findMany({
        select: {
          vehicleType: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.getBenefitConfig(),
      this.prisma.deliveryPricingRule.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    const activeRules = rules.filter((r) => r.status === DeliveryPricingStatus.ACTIVE);
    const activeVehicles = new Set(activeRules.map((r) => r.vehicleType)).size;

    return {
      activeVehicles,
      activePricingRules: activeRules.length,
      freeBikeDeliveries: benefitConfig.firstBikeDeliveriesFree,
      companyAbsorptionInr: benefitConfig.companyAbsorptionInr,
      benefitStatus: benefitConfig.status,
      lastUpdated: lastUpdated?.updatedAt?.toISOString() ?? null,
      totalRules: rules.length,
    };
  }

  async getBenefitConfig() {
    const existing = await this.prisma.deliveryBenefitConfig.findUnique({
      where: { configKey: 'DEFAULT' },
    });
    if (existing) {
      return {
        id: existing.id,
        configKey: existing.configKey,
        firstBikeDeliveriesFree: existing.firstBikeDeliveriesFree,
        companyAbsorptionInr: decimalToNumber(existing.companyAbsorptionInr),
        status: existing.status,
        updatedBy: existing.updatedBy,
        updatedByName: existing.updatedByName,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    const created = await this.prisma.deliveryBenefitConfig.create({
      data: {
        configKey: 'DEFAULT',
        firstBikeDeliveriesFree: DEFAULT_FREE_BIKE_DELIVERIES,
        companyAbsorptionInr: DEFAULT_COMPANY_ABSORPTION_INR,
        status: DeliveryPricingStatus.ACTIVE,
      },
    });

    return {
      id: created.id,
      configKey: created.configKey,
      firstBikeDeliveriesFree: created.firstBikeDeliveriesFree,
      companyAbsorptionInr: decimalToNumber(created.companyAbsorptionInr),
      status: created.status,
      updatedBy: created.updatedBy,
      updatedByName: created.updatedByName,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateBenefitConfig(
    input: {
      firstBikeDeliveriesFree?: number;
      companyAbsorptionInr?: number;
      status?: DeliveryPricingStatus;
    },
    actor?: { id?: string; name?: string },
  ) {
    const current = await this.getBenefitConfig();
    if (input.firstBikeDeliveriesFree != null && input.firstBikeDeliveriesFree < 0) {
      throw new BadRequestException('First bike deliveries free must be >= 0');
    }
    if (input.companyAbsorptionInr != null && input.companyAbsorptionInr < 0) {
      throw new BadRequestException('Company absorption must be >= 0');
    }

    const updated = await this.prisma.deliveryBenefitConfig.update({
      where: { configKey: 'DEFAULT' },
      data: {
        firstBikeDeliveriesFree:
          input.firstBikeDeliveriesFree ?? current.firstBikeDeliveriesFree,
        companyAbsorptionInr:
          input.companyAbsorptionInr ?? current.companyAbsorptionInr,
        status: input.status ?? current.status,
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
    });

    return {
      id: updated.id,
      configKey: updated.configKey,
      firstBikeDeliveriesFree: updated.firstBikeDeliveriesFree,
      companyAbsorptionInr: decimalToNumber(updated.companyAbsorptionInr),
      status: updated.status,
      updatedBy: updated.updatedBy,
      updatedByName: updated.updatedByName,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Resolve list price for vehicle + distance.
   * Nested 0–N slabs: pick the ACTIVE rule with the smallest distanceToKm
   * that still covers the distance (tightest fit).
   */
  async resolveListPrice(
    vehicleType: DeliveryVehicleType,
    distanceKm: number,
  ): Promise<{
    available: boolean;
    message?: string;
    ruleId: string | null;
    version: number | null;
    price: number;
    currency: string;
    distanceFromKm: number | null;
    distanceToKm: number | null;
  }> {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      return {
        available: false,
        message: 'Invalid delivery distance',
        ruleId: null,
        version: null,
        price: 0,
        currency: 'INR',
        distanceFromKm: null,
        distanceToKm: null,
      };
    }

    const rules = await this.prisma.deliveryPricingRule.findMany({
      where: {
        vehicleType,
        status: DeliveryPricingStatus.ACTIVE,
      },
      orderBy: { distanceToKm: 'asc' },
    });

    if (rules.length === 0) {
      return {
        available: false,
        message: `Delivery pricing unavailable for ${DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType]}`,
        ruleId: null,
        version: null,
        price: 0,
        currency: 'INR',
        distanceFromKm: null,
        distanceToKm: null,
      };
    }

    const match = rules.find((r) => {
      const from = decimalToNumber(r.distanceFromKm);
      const to = decimalToNumber(r.distanceToKm);
      return distanceKm >= from && distanceKm <= to;
    });

    if (!match) {
      const maxTo = Math.max(
        ...rules.map((r) => decimalToNumber(r.distanceToKm)),
      );
      return {
        available: false,
        message: `Delivery pricing unavailable for this distance (max configured: ${maxTo} km)`,
        ruleId: null,
        version: null,
        price: 0,
        currency: 'INR',
        distanceFromKm: null,
        distanceToKm: null,
      };
    }

    return {
      available: true,
      ruleId: match.id,
      version: match.version,
      price: toMoney(decimalToNumber(match.price)),
      currency: match.currency,
      distanceFromKm: decimalToNumber(match.distanceFromKm),
      distanceToKm: decimalToNumber(match.distanceToKm),
    };
  }

  /**
   * Server-side delivery charge calculation.
   * Never trust a client-supplied deliveryCharge.
   */
  async calculateCharge(params: {
    vehicleType: DeliveryVehicleType;
    distanceKm: number;
    customerId?: string;
    /** When true, apply first-N free bike benefit if eligible. */
    applyFreeBikeBenefit?: boolean;
  }): Promise<CalculatedDeliveryCharge> {
    const vehicleType = params.vehicleType;
    const distanceKm = toMoney(params.distanceKm);
    const resolved = await this.resolveListPrice(vehicleType, distanceKm);

    const base: CalculatedDeliveryCharge = {
      available: resolved.available,
      message: resolved.message,
      vehicleType,
      vehicleDisplayName: DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType],
      distanceKm,
      listPrice: resolved.price,
      deliveryCharge: resolved.available ? resolved.price : 0,
      currency: resolved.currency,
      pricingRuleId: resolved.ruleId,
      pricingVersion: resolved.version,
      distanceFromKm: resolved.distanceFromKm,
      distanceToKm: resolved.distanceToKm,
      distanceSlab:
        resolved.distanceFromKm != null && resolved.distanceToKm != null
          ? formatDistanceSlab(resolved.distanceFromKm, resolved.distanceToKm)
          : null,
      freeDeliveryApplied: false,
      companyAbsorbedDelivery: 0,
      freeBikeDeliveriesRemaining: null,
      freeBikeDeliveriesAllowed: null,
      freeBikeDeliveriesUsed: null,
    };

    if (!resolved.available || !params.applyFreeBikeBenefit || !params.customerId) {
      return base;
    }

    if (vehicleType !== DeliveryVehicleType.BIKE || resolved.price <= 0) {
      return base;
    }

    const benefitConfig = await this.getBenefitConfig();
    if (benefitConfig.status !== DeliveryPricingStatus.ACTIVE) {
      return base;
    }

    const benefit = await this.prisma.customerDeliveryBenefit.findUnique({
      where: { customerId: params.customerId },
    });

    const totalAllowed =
      benefit?.totalAllowed ?? benefitConfig.firstBikeDeliveriesFree;
    const usedCount = benefit?.usedCount ?? 0;
    const remaining = Math.max(0, totalAllowed - usedCount);

    base.freeBikeDeliveriesAllowed = totalAllowed;
    base.freeBikeDeliveriesUsed = usedCount;
    base.freeBikeDeliveriesRemaining = remaining;

    if (remaining > 0) {
      base.deliveryCharge = 0;
      base.freeDeliveryApplied = true;
      base.companyAbsorbedDelivery = toMoney(benefitConfig.companyAbsorptionInr);
    }

    return base;
  }

  async calculateForCartQuantity(params: {
    quantity: number;
    distanceKm: number;
    customerId?: string;
    applyFreeBikeBenefit?: boolean;
  }) {
    const vehicleType = resolveDeliveryVehicleForQuantity(params.quantity);
    return this.calculateCharge({
      vehicleType,
      distanceKm: params.distanceKm,
      customerId: params.customerId,
      applyFreeBikeBenefit: params.applyFreeBikeBenefit,
    });
  }

  async createRule(
    input: {
      vehicleType: DeliveryVehicleType;
      distanceFromKm: number;
      distanceToKm: number;
      price: number;
      status?: DeliveryPricingStatus;
      reason?: string;
    },
    actor?: { id?: string; name?: string },
  ) {
    this.validateSlabInput(input);
    await this.assertNoCrossingOverlap(
      input.vehicleType,
      input.distanceFromKm,
      input.distanceToKm,
    );

    const rule = await this.prisma.deliveryPricingRule.create({
      data: {
        vehicleType: input.vehicleType,
        distanceFromKm: input.distanceFromKm,
        distanceToKm: input.distanceToKm,
        price: input.price,
        status: input.status ?? DeliveryPricingStatus.ACTIVE,
        createdBy: actor?.id ?? null,
        updatedBy: actor?.id ?? null,
      },
    });

    await this.prisma.deliveryPricingHistory.create({
      data: {
        ruleId: rule.id,
        vehicleType: rule.vehicleType,
        previousPrice: 0,
        newPrice: rule.price,
        previousDistanceFrom: rule.distanceFromKm,
        previousDistanceTo: rule.distanceToKm,
        newDistanceFrom: rule.distanceFromKm,
        newDistanceTo: rule.distanceToKm,
        previousStatus: null,
        newStatus: rule.status,
        reason: input.reason ?? 'Created delivery pricing rule',
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
    });

    return this.mapRule(rule);
  }

  async updateRule(
    id: string,
    input: {
      distanceFromKm?: number;
      distanceToKm?: number;
      price?: number;
      status?: DeliveryPricingStatus;
      reason?: string;
    },
    actor?: { id?: string; name?: string },
  ) {
    const existing = await this.prisma.deliveryPricingRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Delivery pricing rule not found');

    const nextFrom =
      input.distanceFromKm ?? decimalToNumber(existing.distanceFromKm);
    const nextTo = input.distanceToKm ?? decimalToNumber(existing.distanceToKm);
    const nextPrice = input.price ?? decimalToNumber(existing.price);
    const nextStatus = input.status ?? existing.status;

    this.validateSlabInput({
      distanceFromKm: nextFrom,
      distanceToKm: nextTo,
      price: nextPrice,
    });

    await this.assertNoCrossingOverlap(
      existing.vehicleType,
      nextFrom,
      nextTo,
      id,
    );

    const updated = await this.prisma.deliveryPricingRule.update({
      where: { id },
      data: {
        distanceFromKm: nextFrom,
        distanceToKm: nextTo,
        price: nextPrice,
        status: nextStatus,
        version: { increment: 1 },
        updatedBy: actor?.id ?? null,
      },
    });

    await this.prisma.deliveryPricingHistory.create({
      data: {
        ruleId: updated.id,
        vehicleType: updated.vehicleType,
        previousPrice: existing.price,
        newPrice: updated.price,
        previousDistanceFrom: existing.distanceFromKm,
        previousDistanceTo: existing.distanceToKm,
        newDistanceFrom: updated.distanceFromKm,
        newDistanceTo: updated.distanceToKm,
        previousStatus: existing.status,
        newStatus: updated.status,
        reason: input.reason ?? 'Updated delivery pricing',
        updatedBy: actor?.id ?? null,
        updatedByName: actor?.name ?? null,
      },
    });

    return this.mapRule(updated);
  }

  async updateStatus(
    id: string,
    status: DeliveryPricingStatus,
    actor?: { id?: string; name?: string },
    reason?: string,
  ) {
    return this.updateRule(id, { status, reason }, actor);
  }

  async deleteRule(id: string, actor?: { id?: string; name?: string }) {
    const existing = await this.prisma.deliveryPricingRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Delivery pricing rule not found');

    // Soft-deactivate instead of hard delete to preserve history references
    return this.updateRule(
      id,
      {
        status: DeliveryPricingStatus.INACTIVE,
        reason: 'Deactivated (delete requested)',
      },
      actor,
    );
  }

  async getHistory(ruleId: string) {
    await this.getRuleById(ruleId);
    const rows = await this.prisma.deliveryPricingHistory.findMany({
      where: { ruleId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((h) => ({
      id: h.id,
      ruleId: h.ruleId,
      vehicleType: h.vehicleType,
      vehicleDisplayName: DELIVERY_VEHICLE_DISPLAY_NAMES[h.vehicleType],
      previousPrice: decimalToNumber(h.previousPrice),
      newPrice: decimalToNumber(h.newPrice),
      previousDistanceFrom: decimalToNumber(h.previousDistanceFrom),
      previousDistanceTo: decimalToNumber(h.previousDistanceTo),
      newDistanceFrom: decimalToNumber(h.newDistanceFrom),
      newDistanceTo: decimalToNumber(h.newDistanceTo),
      previousDistanceSlab: formatDistanceSlab(
        decimalToNumber(h.previousDistanceFrom),
        decimalToNumber(h.previousDistanceTo),
      ),
      newDistanceSlab: formatDistanceSlab(
        decimalToNumber(h.newDistanceFrom),
        decimalToNumber(h.newDistanceTo),
      ),
      previousStatus: h.previousStatus,
      newStatus: h.newStatus,
      reason: h.reason,
      updatedBy: h.updatedBy,
      updatedByName: h.updatedByName ?? 'System',
      createdAt: h.createdAt.toISOString(),
    }));
  }

  private validateSlabInput(input: {
    distanceFromKm: number;
    distanceToKm: number;
    price: number;
  }) {
    if (input.price < 0) {
      throw new BadRequestException('Delivery charge must be >= 0');
    }
    if (input.distanceFromKm < 0) {
      throw new BadRequestException('Distance from must be >= 0');
    }
    if (input.distanceToKm <= input.distanceFromKm) {
      throw new BadRequestException('Distance to must be greater than distance from');
    }
  }

  /**
   * Allow nested 0–N slabs (Excel style). Reject crossing/partial overlaps
   * and exact duplicates.
   */
  private async assertNoCrossingOverlap(
    vehicleType: DeliveryVehicleType,
    fromKm: number,
    toKm: number,
    excludeId?: string,
  ) {
    const existing = await this.prisma.deliveryPricingRule.findMany({
      where: {
        vehicleType,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    for (const rule of existing) {
      const a = decimalToNumber(rule.distanceFromKm);
      const b = decimalToNumber(rule.distanceToKm);

      if (a === fromKm && b === toKm) {
        throw new BadRequestException(
          `A pricing rule already exists for ${DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType]} ${formatDistanceSlab(fromKm, toKm)}.`,
        );
      }

      const nested =
        (fromKm >= a && toKm <= b) || (a >= fromKm && b <= toKm);
      const crosses = fromKm < b && toKm > a;

      if (crosses && !nested) {
        throw new BadRequestException(
          `Distance slab overlaps with an existing ${DELIVERY_VEHICLE_DISPLAY_NAMES[vehicleType]} pricing rule (${formatDistanceSlab(a, b)}).`,
        );
      }
    }
  }

  private mapRule(rule: {
    id: string;
    vehicleType: DeliveryVehicleType;
    distanceFromKm: Prisma.Decimal | number;
    distanceToKm: Prisma.Decimal | number;
    price: Prisma.Decimal | number;
    currency: string;
    status: DeliveryPricingStatus;
    version: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const from = decimalToNumber(rule.distanceFromKm);
    const to = decimalToNumber(rule.distanceToKm);
    return {
      id: rule.id,
      vehicleType: rule.vehicleType,
      vehicleDisplayName: DELIVERY_VEHICLE_DISPLAY_NAMES[rule.vehicleType],
      distanceFromKm: from,
      distanceToKm: to,
      distanceSlab: formatDistanceSlab(from, to),
      price: decimalToNumber(rule.price),
      currency: rule.currency,
      status: rule.status,
      version: rule.version,
      createdBy: rule.createdBy,
      updatedBy: rule.updatedBy,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
