import { Injectable, NotFoundException } from '@nestjs/common';
import { RedirectType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateQuickActionDto,
  UpdateQuickActionDto,
} from './dto/admin-quick-actions.dto';

@Injectable()
export class AdminQuickActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll() {
    return this.prisma.quickAction.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.quickAction.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Quick action not found');
    return item;
  }

  async create(dto: CreateQuickActionDto) {
    const item = await this.prisma.quickAction.create({
      data: {
        label: dto.label,
        slug: dto.slug,
        iconUrl: dto.iconUrl,
        iconKey: dto.iconKey,
        redirectType: dto.redirectType ?? RedirectType.ROUTE,
        redirectId: dto.redirectId,
        displayOrder: dto.displayOrder ?? 0,
        isVisible: dto.isVisible ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    await this.cache.invalidateCms();
    return item;
  }

  async update(id: string, dto: UpdateQuickActionDto) {
    await this.findOne(id);
    const item = await this.prisma.quickAction.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.iconKey !== undefined && { iconKey: dto.iconKey }),
        ...(dto.redirectType !== undefined && {
          redirectType: dto.redirectType,
        }),
        ...(dto.redirectId !== undefined && { redirectId: dto.redirectId }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        }),
        ...(dto.endsAt !== undefined && {
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        }),
      },
    });
    await this.cache.invalidateCms();
    return item;
  }

  async remove(id: string) {
    await this.findOne(id);
    const item = await this.prisma.quickAction.update({
      where: { id },
      data: { deletedAt: new Date(), isVisible: false },
    });
    await this.cache.invalidateCms();
    return item;
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.quickAction.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }
}
