import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddressType, SiteType } from '../../../generated/prisma/client';
import { CACHE_KEYS, CACHE_TTL } from '../../common/cache/cache.constants';
import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateSiteDto, SiteResponseDto, UpdateSiteDto } from './dto/site.dto';

type AddressRow = {
  id: string;
  customerId: string;
  label: string | null;
  siteType: SiteType | null;
  contactPerson: string | null;
  phone: string | null;
  line1: string;
  landmark: string | null;
  gateNumber: string | null;
  floor: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  latitude: unknown;
  longitude: unknown;
  deliveryNotes: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { orders: number };
};

@Injectable()
export class CustomerSitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(customerId: string): Promise<SiteResponseDto[]> {
    const cacheKey = CACHE_KEYS.SITES(customerId);
    const cached = await this.cache.get<SiteResponseDto[]>(cacheKey);
    if (cached) return cached;

    const sites = await this.prisma.address.findMany({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    const mapped = sites.map((s) => this.mapSite(s));
    await this.cache.set(cacheKey, mapped, CACHE_TTL.SITES);
    return mapped;
  }

  async getCurrent(customerId: string): Promise<SiteResponseDto | null> {
    const cacheKey = CACHE_KEYS.CURRENT_SITE(customerId);
    const cached = await this.cache.get<SiteResponseDto | null>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const primary = await this.prisma.address.findFirst({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
        isDefault: true,
      },
    });

    if (primary) {
      const mapped = this.mapSite(primary);
      await this.cache.set(cacheKey, mapped, CACHE_TTL.SITES);
      return mapped;
    }

    const fallback = await this.prisma.address.findFirst({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = fallback ? this.mapSite(fallback) : null;
    if (mapped) {
      await this.cache.set(cacheKey, mapped, CACHE_TTL.SITES);
    }
    return mapped;
  }

  async create(
    customerId: string,
    dto: CreateSiteDto,
  ): Promise<SiteResponseDto> {
    this.assertCoords(dto.latitude, dto.longitude);

    const siteCount = await this.prisma.address.count({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
      },
    });

    const makePrimary = dto.isPrimary ?? siteCount === 0;
    if (makePrimary) {
      await this.clearPrimary(customerId);
    }

    const site = await this.prisma.address.create({
      data: {
        customerId,
        type: AddressType.PROJECT_SITE,
        label: dto.siteName,
        siteType: dto.siteType ?? SiteType.CONSTRUCTION_SITE,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        line1: dto.fullAddress,
        landmark: dto.landmark,
        gateNumber: dto.gateNumber,
        floor: dto.floor,
        city: dto.city,
        state: dto.state,
        country: dto.country ?? 'India',
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        deliveryNotes: dto.deliveryNotes,
        isDefault: makePrimary,
      },
    });

    await this.cache.invalidateProfile(customerId);
    return this.mapSite(site);
  }

  async update(
    customerId: string,
    siteId: string,
    dto: UpdateSiteDto,
  ): Promise<SiteResponseDto> {
    await this.ensureOwnership(customerId, siteId);

    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      const existing = await this.prisma.address.findUnique({
        where: { id: siteId },
      });
      const lat = dto.latitude ?? Number(existing?.latitude);
      const lng = dto.longitude ?? Number(existing?.longitude);
      this.assertCoords(lat, lng);
    }

    if (dto.isPrimary) {
      await this.clearPrimary(customerId);
    }

    const site = await this.prisma.address.update({
      where: { id: siteId },
      data: {
        ...(dto.siteName !== undefined && { label: dto.siteName }),
        ...(dto.siteType !== undefined && { siteType: dto.siteType }),
        ...(dto.contactPerson !== undefined && {
          contactPerson: dto.contactPerson,
        }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.fullAddress !== undefined && { line1: dto.fullAddress }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.gateNumber !== undefined && { gateNumber: dto.gateNumber }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.deliveryNotes !== undefined && {
          deliveryNotes: dto.deliveryNotes,
        }),
        ...(dto.isPrimary !== undefined && { isDefault: dto.isPrimary }),
      },
    });

    await this.cache.invalidateProfile(customerId);
    return this.mapSite(site);
  }

  async remove(customerId: string, siteId: string): Promise<void> {
    const site = await this.ensureOwnership(customerId, siteId);

    await this.prisma.address.update({
      where: { id: siteId },
      data: { deletedAt: new Date(), isDefault: false },
    });

    if (site.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: {
          customerId,
          deletedAt: null,
          type: AddressType.PROJECT_SITE,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await this.prisma.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    await this.cache.invalidateProfile(customerId);
  }

  async setPrimary(
    customerId: string,
    siteId: string,
  ): Promise<SiteResponseDto> {
    await this.ensureOwnership(customerId, siteId);
    await this.clearPrimary(customerId);

    const site = await this.prisma.address.update({
      where: { id: siteId },
      data: { isDefault: true },
    });

    await this.cache.invalidateProfile(customerId);
    return this.mapSite(site);
  }

  /** Admin: list sites for a customer with order counts. */
  async listForAdmin(customerId: string): Promise<SiteResponseDto[]> {
    const sites = await this.prisma.address.findMany({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
      },
      include: { _count: { select: { orders: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return sites.map((s) => this.mapSite(s));
  }

  async createForAdmin(
    customerId: string,
    dto: CreateSiteDto,
  ): Promise<SiteResponseDto> {
    return this.create(customerId, dto);
  }

  async updateForAdmin(
    customerId: string,
    siteId: string,
    dto: UpdateSiteDto,
  ): Promise<SiteResponseDto> {
    return this.update(customerId, siteId, dto);
  }

  async removeForAdmin(customerId: string, siteId: string): Promise<void> {
    return this.remove(customerId, siteId);
  }

  async setPrimaryForAdmin(
    customerId: string,
    siteId: string,
  ): Promise<SiteResponseDto> {
    return this.setPrimary(customerId, siteId);
  }

  private assertCoords(lat?: number, lng?: number): void {
    if (
      lat === undefined ||
      lng === undefined ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      throw new BadRequestException('Latitude and longitude are required');
    }
  }

  private async clearPrimary(customerId: string): Promise<void> {
    await this.prisma.address.updateMany({
      where: {
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  private async ensureOwnership(
    customerId: string,
    siteId: string,
  ): Promise<AddressRow> {
    const site = await this.prisma.address.findFirst({
      where: {
        id: siteId,
        customerId,
        deletedAt: null,
        type: AddressType.PROJECT_SITE,
      },
    });
    if (!site) {
      throw new NotFoundException('Delivery site not found');
    }
    return site;
  }

  private mapSite(site: AddressRow): SiteResponseDto {
    return {
      id: site.id,
      customerId: site.customerId,
      siteName: site.label ?? 'Delivery Site',
      siteType: site.siteType,
      contactPerson: site.contactPerson,
      phone: site.phone,
      fullAddress: site.line1,
      landmark: site.landmark,
      gateNumber: site.gateNumber,
      floor: site.floor,
      city: site.city,
      state: site.state,
      country: site.country,
      pincode: site.pincode,
      latitude: site.latitude ? Number(site.latitude) : 0,
      longitude: site.longitude ? Number(site.longitude) : 0,
      deliveryNotes: site.deliveryNotes,
      isPrimary: site.isDefault,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      ...(site._count ? { ordersDelivered: site._count.orders } : {}),
    };
  }
}
