import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Visibility } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateBannerDto, UpdateBannerDto } from './dto/admin-banners.dto';

@Injectable()
export class AdminBannersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(placement?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (placement) where['placement'] = placement;
    return this.prisma.banner.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findFirst({ where: { id, deletedAt: null } });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        imageUrl: dto.imageUrl,
        subtitle: dto.subtitle,
        mobileUrl: dto.mobileUrl,
        ctaLabel: dto.ctaLabel,
        linkUrl: dto.linkUrl,
        linkType: dto.linkType,
        placement: (dto.placement as any) ?? 'HOME_HERO',
        displayOrder: dto.displayOrder ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: 'DRAFT',
        isVisible: false,
      },
    });
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt !== undefined && { endsAt: new Date(dto.endsAt) }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.banner.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async publish(id: string) {
    await this.findOne(id);
    return this.prisma.banner.update({ where: { id }, data: { status: EntityStatus.ACTIVE, isVisible: true, visibility: Visibility.PUBLIC } });
  }

  async unpublish(id: string) {
    await this.findOne(id);
    return this.prisma.banner.update({ where: { id }, data: { status: EntityStatus.INACTIVE, isVisible: false } });
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.banner.update({ where: { id: item.id }, data: { displayOrder: item.displayOrder } }),
      ),
    );
    return { reordered: items.length };
  }
}
