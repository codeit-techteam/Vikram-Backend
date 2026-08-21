import { Injectable, NotFoundException } from '@nestjs/common';
import { RedirectType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateAdvertisementDto,
  UpdateAdvertisementDto,
} from './dto/admin-advertisements.dto';

@Injectable()
export class AdminAdvertisementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll() {
    return this.prisma.advertisement.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const ad = await this.prisma.advertisement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ad) throw new NotFoundException('Advertisement not found');
    return ad;
  }

  async create(dto: CreateAdvertisementDto) {
    const ad = await this.prisma.advertisement.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        brandName: dto.brandName,
        imageUrl: dto.imageUrl,
        logoUrl: dto.logoUrl,
        description: dto.description,
        buttonText: dto.buttonText,
        redirectType: dto.redirectType ?? RedirectType.NONE,
        redirectId: dto.redirectId,
        displayOrder: dto.displayOrder ?? 0,
        priority: dto.priority ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? false,
      },
    });
    await this.cache.invalidateCms();
    return ad;
  }

  async update(id: string, dto: UpdateAdvertisementDto) {
    await this.findOne(id);
    const ad = await this.prisma.advertisement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.brandName !== undefined && { brandName: dto.brandName }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.buttonText !== undefined && { buttonText: dto.buttonText }),
        ...(dto.redirectType !== undefined && {
          redirectType: dto.redirectType,
        }),
        ...(dto.redirectId !== undefined && { redirectId: dto.redirectId }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    await this.cache.invalidateCms();
    return ad;
  }

  async remove(id: string) {
    await this.findOne(id);
    const ad = await this.prisma.advertisement.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.cache.invalidateCms();
    return ad;
  }

  async activate(id: string) {
    await this.findOne(id);
    const ad = await this.prisma.advertisement.update({
      where: { id },
      data: { isActive: true },
    });
    await this.cache.invalidateCms();
    return ad;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    const ad = await this.prisma.advertisement.update({
      where: { id },
      data: { isActive: false },
    });
    await this.cache.invalidateCms();
    return ad;
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.advertisement.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }
}
