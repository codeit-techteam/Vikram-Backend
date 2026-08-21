import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { DeliveryPricingService } from './delivery-pricing.service';

export interface DeliveryBenefitSummary {
  benefitType: string;
  totalAllowed: number;
  usedCount: number;
  remainingCount: number;
  companyCostPerUse: number;
}

@Injectable()
export class DeliveryBenefitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: DeliveryPricingService,
  ) {}

  async ensureBenefit(customerId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const config = await this.pricingService.getBenefitConfig();

    return client.customerDeliveryBenefit.upsert({
      where: { customerId },
      create: {
        customerId,
        benefitType: 'FREE_BIKE_DELIVERY',
        totalAllowed: config.firstBikeDeliveriesFree,
        usedCount: 0,
        companyCostPerUse: config.companyAbsorptionInr,
      },
      update: {},
    });
  }

  async getSummary(customerId: string): Promise<DeliveryBenefitSummary> {
    const benefit = await this.ensureBenefit(customerId);
    const remaining = Math.max(0, benefit.totalAllowed - benefit.usedCount);
    return {
      benefitType: benefit.benefitType,
      totalAllowed: benefit.totalAllowed,
      usedCount: benefit.usedCount,
      remainingCount: remaining,
      companyCostPerUse: Number(benefit.companyCostPerUse),
    };
  }

  /**
   * Preview whether this checkout can use a free bike delivery slot.
   * Does not consume the benefit.
   * Company absorption comes from DeliveryBenefitConfig (not Bike list price).
   */
  async canUseFreeBikeDelivery(customerId: string): Promise<{
    eligible: boolean;
    remainingCount: number;
    absorbedCost: number;
    totalAllowed: number;
    usedCount: number;
  }> {
    const config = await this.pricingService.getBenefitConfig();
    if (config.status !== 'ACTIVE') {
      return {
        eligible: false,
        remainingCount: 0,
        absorbedCost: config.companyAbsorptionInr,
        totalAllowed: config.firstBikeDeliveriesFree,
        usedCount: 0,
      };
    }

    const summary = await this.getSummary(customerId);
    return {
      eligible: summary.remainingCount > 0,
      remainingCount: summary.remainingCount,
      absorbedCost: config.companyAbsorptionInr,
      totalAllowed: summary.totalAllowed,
      usedCount: summary.usedCount,
    };
  }

  /**
   * Atomically consume one free bike delivery for an order.
   * Returns absorbed cost if consumed, or null if no slots left / already used.
   * Absorbed cost uses DeliveryBenefitConfig.companyAbsorptionInr (₹99),
   * independent of the configured Bike delivery list price.
   */
  async consumeFreeBikeDelivery(params: {
    customerId: string;
    orderId: string;
    tx: Prisma.TransactionClient;
  }): Promise<{ absorbedCost: number; remainingAfter: number } | null> {
    const benefit = await this.ensureBenefit(params.customerId, params.tx);
    const config = await this.pricingService.getBenefitConfig();

    const existing = await params.tx.deliveryBenefitUsage.findUnique({
      where: { orderId: params.orderId },
    });
    if (existing) {
      return {
        absorbedCost: Number(existing.absorbedCost),
        remainingAfter: Math.max(0, benefit.totalAllowed - benefit.usedCount),
      };
    }

    if (benefit.usedCount >= benefit.totalAllowed) {
      return null;
    }

    const updated = await params.tx.customerDeliveryBenefit.updateMany({
      where: {
        id: benefit.id,
        usedCount: { lt: benefit.totalAllowed },
      },
      data: {
        usedCount: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return null;
    }

    const absorbedCost = config.companyAbsorptionInr;
    await params.tx.deliveryBenefitUsage.create({
      data: {
        benefitId: benefit.id,
        customerId: params.customerId,
        orderId: params.orderId,
        absorbedCost,
      },
    });

    return {
      absorbedCost,
      remainingAfter: Math.max(
        0,
        benefit.totalAllowed - (benefit.usedCount + 1),
      ),
    };
  }

  /**
   * Restore one free bike delivery slot when an order that consumed it is cancelled.
   */
  async restoreFreeBikeDelivery(params: {
    orderId: string;
    tx?: Prisma.TransactionClient;
  }): Promise<boolean> {
    const client = params.tx ?? this.prisma;
    const usage = await client.deliveryBenefitUsage.findUnique({
      where: { orderId: params.orderId },
    });
    if (!usage) return false;

    await client.deliveryBenefitUsage.delete({
      where: { id: usage.id },
    });

    await client.customerDeliveryBenefit.updateMany({
      where: {
        id: usage.benefitId,
        usedCount: { gt: 0 },
      },
      data: {
        usedCount: { decrement: 1 },
      },
    });

    return true;
  }
}
