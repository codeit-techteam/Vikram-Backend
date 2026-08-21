import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type {
  CreateCategoryDto,
  UpdateCategoryDto,
  ReorderCategoriesDto,
} from './dto/admin-categories.dto';

@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll() {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async findOne(id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        parent: true,
        children: { where: { deletedAt: null } },
        _count: { select: { products: true } },
      },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const cat = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        nameHi: dto.nameHi,
        description: dto.description,
        imageUrl: dto.imageUrl,
        iconUrl: dto.iconUrl,
        parentId: dto.parentId,
        isFeatured: dto.isFeatured ?? false,
        displayOrder: dto.displayOrder ?? 0,
        status: (dto.status as any) ?? 'ACTIVE',
      },
    });
    await this.cache.invalidateCategories();
    return cat;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    const cat = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameHi !== undefined && { nameHi: dto.nameHi }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        ...(dto.status !== undefined && { status: dto.status as EntityStatus }),
      },
    });
    await this.cache.invalidateCategories();
    return cat;
  }

  async remove(id: string) {
    await this.findOne(id);
    const cat = await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.cache.invalidateCategories();
    return cat;
  }

  async toggleActive(id: string) {
    const cat = await this.findOne(id);
    const newStatus =
      cat.status === EntityStatus.ACTIVE
        ? EntityStatus.INACTIVE
        : EntityStatus.ACTIVE;
    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        status: newStatus,
        isVisible: newStatus === EntityStatus.ACTIVE,
      },
    });
    await this.cache.invalidateCategories();
    return updated;
  }

  async reorder(dto: ReorderCategoriesDto) {
    await Promise.all(
      dto.items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCategories();
    return { reordered: dto.items.length };
  }
}
