import { Injectable, NotFoundException } from '@nestjs/common';
import { RedirectType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreatePromotionalCardDto,
  UpdatePromotionalCardDto,
} from './dto/admin-promotional-cards.dto';

@Injectable()
export class AdminPromotionalCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll(cardType?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (cardType) where['cardType'] = cardType;
    return this.prisma.promotionalCard.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { priority: 'desc' }],
    });
  }

  async findOne(id: string) {
    const card = await this.prisma.promotionalCard.findFirst({
      where: { id, deletedAt: null },
    });
    if (!card) throw new NotFoundException('Promotional card not found');
    return card;
  }

  async create(dto: CreatePromotionalCardDto) {
    const card = await this.prisma.promotionalCard.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        cardType: dto.cardType,
        subtitle: dto.subtitle,
        description: dto.description,
        imageUrl: dto.imageUrl,
        buttonText: dto.buttonText,
        badge: dto.badge,
        benefits: dto.benefits,
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
    return card;
  }

  async update(id: string, dto: UpdatePromotionalCardDto) {
    await this.findOne(id);
    const card = await this.prisma.promotionalCard.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.cardType !== undefined && { cardType: dto.cardType }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.buttonText !== undefined && { buttonText: dto.buttonText }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.benefits !== undefined && { benefits: dto.benefits }),
        ...(dto.redirectType !== undefined && { redirectType: dto.redirectType }),
        ...(dto.redirectId !== undefined && { redirectId: dto.redirectId }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
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
    return card;
  }

  async remove(id: string) {
    await this.findOne(id);
    const card = await this.prisma.promotionalCard.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.cache.invalidateCms();
    return card;
  }

  async activate(id: string) {
    await this.findOne(id);
    const card = await this.prisma.promotionalCard.update({
      where: { id },
      data: { isActive: true },
    });
    await this.cache.invalidateCms();
    return card;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    const card = await this.prisma.promotionalCard.update({
      where: { id },
      data: { isActive: false },
    });
    await this.cache.invalidateCms();
    return card;
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.promotionalCard.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }
}
