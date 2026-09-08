import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CustomerStatus,
  Prisma,
  PushCampaignAudienceType,
  PushUserSegment,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import {
  ACTIVE_WITHIN_DAYS,
  CUSTOMER_QUERY_PAGE,
  DORMANT_AFTER_DAYS,
  NEW_CUSTOMER_DAYS,
  ROLE_SEGMENT_SLUGS,
} from './push.constants';
import { isUuid } from './push-deep-link';

export interface AudienceTargetInput {
  hubIds?: string[];
  cities?: string[];
  segments?: Array<PushUserSegment | string>;
  customerIds?: string[];
}

const ELIGIBLE_CUSTOMER: Prisma.CustomerWhereInput = {
  status: CustomerStatus.ACTIVE,
  deletedAt: null,
};

@Injectable()
export class AudienceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCustomerIds(
    audienceType: PushCampaignAudienceType,
    targets: AudienceTargetInput,
  ): Promise<string[]> {
    switch (audienceType) {
      case PushCampaignAudienceType.ALL:
        return this.collectIds(ELIGIBLE_CUSTOMER);
      case PushCampaignAudienceType.CITY_HUB:
        return this.resolveCityOrHub(targets);
      case PushCampaignAudienceType.SEGMENT:
        return this.resolveSegments(targets.segments ?? []);
      case PushCampaignAudienceType.CUSTOM_LIST:
        return this.resolveCustomList(targets.customerIds ?? []);
      default:
        throw new BadRequestException('Unsupported audience type');
    }
  }

  async countEligible(where: Prisma.CustomerWhereInput): Promise<number> {
    return this.prisma.customer.count({ where: { ...ELIGIBLE_CUSTOMER, ...where } });
  }

  private async resolveCityOrHub(targets: AudienceTargetInput): Promise<string[]> {
    const hubIds = (targets.hubIds ?? []).filter(isUuid);
    const cities = (targets.cities ?? [])
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (hubIds.length === 0 && cities.length === 0) {
      throw new BadRequestException(
        'Select at least one city or hub for this audience',
      );
    }

    const cityFilter =
      cities.length > 0
        ? {
            OR: [
              { assignedHub: { city: { in: cities, mode: 'insensitive' as const } } },
              {
                addresses: {
                  some: {
                    deletedAt: null,
                    city: { in: cities, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : null;

    const where: Prisma.CustomerWhereInput = {
      ...ELIGIBLE_CUSTOMER,
      OR: [
        ...(hubIds.length > 0 ? [{ assignedHubId: { in: hubIds } }] : []),
        ...(cityFilter ? [cityFilter] : []),
      ],
    };

    return this.collectIds(where);
  }

  private async resolveSegments(
    segments: Array<PushUserSegment | string>,
  ): Promise<string[]> {
    const normalized = segments
      .map((s) => String(s).trim().toUpperCase().replace(/-/g, '_'))
      .filter(Boolean);

    if (normalized.length === 0) {
      throw new BadRequestException('Select at least one user segment');
    }

    const idSets: string[][] = [];
    for (const segment of normalized) {
      idSets.push(await this.resolveSingleSegment(segment));
    }

    return [...new Set(idSets.flat())];
  }

  private async resolveSingleSegment(segment: string): Promise<string[]> {
    const now = new Date();
    const newSince = daysAgo(now, NEW_CUSTOMER_DAYS);
    const activeSince = daysAgo(now, ACTIVE_WITHIN_DAYS);
    const dormantBefore = daysAgo(now, DORMANT_AFTER_DAYS);

    switch (segment) {
      case PushUserSegment.NEW_CUSTOMERS:
      case 'NEW':
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          createdAt: { gte: newSince },
          orders: { none: {} },
        });
      case PushUserSegment.EXISTING_CUSTOMERS:
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          orders: { some: {} },
        });
      case PushUserSegment.ACTIVE:
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          OR: [
            { orders: { some: { createdAt: { gte: activeSince } } } },
            { deviceSessions: { some: { lastLogin: { gte: activeSince } } } },
          ],
        });
      case PushUserSegment.DORMANT:
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          AND: [
            { orders: { none: { createdAt: { gte: dormantBefore } } } },
            {
              OR: [
                { deviceSessions: { none: {} } },
                { deviceSessions: { every: { lastLogin: { lt: dormantBefore } } } },
              ],
            },
          ],
        });
      case PushUserSegment.MEMBERS:
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          isMember: true,
        });
      default: {
        const slug = ROLE_SEGMENT_SLUGS[segment];
        if (!slug) {
          throw new BadRequestException(`Unknown user segment: ${segment}`);
        }
        return this.collectIds({
          ...ELIGIBLE_CUSTOMER,
          role: { slug },
        });
      }
    }
  }

  private async resolveCustomList(customerIds: string[]): Promise<string[]> {
    const ids = [...new Set(customerIds.filter(isUuid))];
    if (ids.length === 0) {
      throw new BadRequestException('Select at least one customer');
    }

    const rows = await this.prisma.customer.findMany({
      where: { ...ELIGIBLE_CUSTOMER, id: { in: ids } },
      select: { id: true },
    });
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Customer not found or not eligible: ${missing[0]}`,
      );
    }
    return ids.filter((id) => found.has(id));
  }

  private async collectIds(where: Prisma.CustomerWhereInput): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.customer.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: CUSTOMER_QUERY_PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (page.length === 0) break;
      ids.push(...page.map((r) => r.id));
      if (page.length < CUSTOMER_QUERY_PAGE) break;
      cursor = page[page.length - 1]?.id;
    }
    return ids;
  }
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
