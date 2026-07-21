import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Visibility } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto, ReorderCategoriesDto } from './dto/admin-categories.dto';

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { parent: true, children: { where: { deletedAt: null } }, _count: { select: { products: true } } },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
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
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nameHi !== undefined && { nameHi: dto.nameHi }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        ...(dto.status !== undefined && { status: dto.status as EntityStatus }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async toggleActive(id: string) {
    const cat = await this.findOne(id);
    const newStatus = cat.status === EntityStatus.ACTIVE ? EntityStatus.INACTIVE : EntityStatus.ACTIVE;
    return this.prisma.category.update({ where: { id }, data: { status: newStatus } });
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
    return { reordered: dto.items.length };
  }
}
