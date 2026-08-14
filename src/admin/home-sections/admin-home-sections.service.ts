import { Injectable, NotFoundException } from '@nestjs/common';
import { HomeSectionType } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type { UpdateHomeSectionDto } from './dto/admin-home-sections.dto';

@Injectable()
export class AdminHomeSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll() {
    return this.prisma.homeSection.findMany({
      where: {
        sectionType: {
          notIn: [HomeSectionType.LOYALTY, HomeSectionType.MEMBERSHIP],
        },
      },
      orderBy: [{ displayOrder: 'asc' }],
    });
  }

  async findOne(id: string) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');
    return section;
  }

  async update(id: string, dto: UpdateHomeSectionDto) {
    await this.findOne(id);
    const section = await this.prisma.homeSection.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.subtitle !== undefined && { subtitle: dto.subtitle }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        ...(dto.apiSource !== undefined && { apiSource: dto.apiSource }),
        ...(dto.layoutType !== undefined && { layoutType: dto.layoutType }),
      },
    });
    await this.cache.invalidateCms();
    return section;
  }

  async toggle(id: string) {
    const section = await this.findOne(id);
    const updated = await this.prisma.homeSection.update({
      where: { id },
      data: { enabled: !section.enabled },
    });
    await this.cache.invalidateCms();
    return updated;
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) =>
        this.prisma.homeSection.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    await this.cache.invalidateCms();
    return { reordered: items.length };
  }
}
