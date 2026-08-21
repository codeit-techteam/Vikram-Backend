import { Injectable, Logger } from '@nestjs/common';
import { EntityStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { decimalToNumber } from '../../common/shopping/pricing.util';
import {
  evaluateHubRouting,
  selectNearestEligibleHub,
} from './hub-routing.logic';
import type {
  CoverageHubMatch,
  CoverageLocationInput,
  CoverageStockItem,
  HubRoutingCandidateInput,
  HubRoutingDecision,
} from './coverage.types';

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findNearestHub(
    location: CoverageLocationInput,
    items: CoverageStockItem[] = [],
  ): Promise<CoverageHubMatch | null> {
    const decision = await this.routeOrder(location, items);
    return selectNearestEligibleHub(decision);
  }

  async findMatchingHubs(
    location: CoverageLocationInput,
    items: CoverageStockItem[] = [],
  ): Promise<CoverageHubMatch[]> {
    const decision = await this.routeOrder(location, items);
    return decision.matches;
  }

  async routeOrder(
    location: CoverageLocationInput,
    items: CoverageStockItem[] = [],
  ): Promise<HubRoutingDecision> {
    const hubs = await this.loadActiveHubs(items);
    const decision = evaluateHubRouting(location, hubs, items);
    this.logRouting(decision);
    return decision;
  }

  async getHubInventoryForProducts(hubId: string, productIds?: string[]) {
    const where: Prisma.HubInventoryWhereInput = { hubId };
    if (productIds?.length) {
      where.productId = { in: productIds };
    }

    const rows = await this.prisma.hubInventory.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            unit: true,
            retailPrice: true,
            deliveryETA: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.product.name,
      slug: row.product.slug,
      unit: row.product.unit,
      availableQty: row.availableQty,
      reservedQty: row.reservedQty,
      lowStockThreshold: row.lowStockThreshold,
      inStock: row.availableQty > 0,
      deliveryETA: row.product.deliveryETA,
      retailPrice: decimalToNumber(row.product.retailPrice),
    }));
  }

  private async loadActiveHubs(
    items: CoverageStockItem[],
  ): Promise<HubRoutingCandidateInput[]> {
    const productIds = items.map((item) => item.productId);

    const hubs = await this.prisma.hub.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: EntityStatus.ACTIVE,
      },
      include: {
        inventory:
          productIds.length > 0
            ? { where: { productId: { in: productIds } } }
            : false,
      },
    });

    return hubs.map((hub) => ({
      id: hub.id,
      code: hub.code,
      name: hub.name,
      city: hub.city,
      state: hub.state,
      pincode: hub.pincode,
      latitude: decimalToNumber(hub.latitude),
      longitude: decimalToNumber(hub.longitude),
      serviceRadiusKm: decimalToNumber(hub.serviceRadiusKm),
      coveragePincodes: hub.coveragePincodes ?? [],
      workingHours: hub.workingHours ?? null,
      hubType: hub.hubType ?? null,
      isActive: hub.isActive,
      inventory: Array.isArray(hub.inventory)
        ? hub.inventory.map((row) => ({
            productId: row.productId,
            availableQty: row.availableQty,
          }))
        : undefined,
    }));
  }

  private logRouting(decision: HubRoutingDecision): void {
    const { snapshot, nearestHub, nearestEligibleHub, assignableHub } =
      decision;
    const focus = assignableHub ?? nearestEligibleHub ?? nearestHub;

    this.logger.log(
      [
        'HUB_ROUTING',
        `Customer: ${snapshot.customerLatitude ?? 'n/a'}, ${snapshot.customerLongitude ?? 'n/a'}`,
        `Hub: ${focus?.name ?? 'none'}`,
        `Distance: ${focus && Number.isFinite(focus.distanceKm) ? `${focus.distanceKm} km` : 'n/a'}`,
        `Radius: ${focus ? `${focus.serviceRadiusKm} km` : 'n/a'}`,
        `Eligible: ${Boolean(nearestEligibleHub)}`,
        `Assignable: ${Boolean(assignableHub)}`,
        `Reason: ${decision.reason}`,
      ].join(' | '),
    );
  }
}
