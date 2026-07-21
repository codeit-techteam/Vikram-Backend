import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus, Visibility } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { CreateVideoDto, UpdateVideoDto } from './dto/admin-videos.dto';

@Injectable()
export class AdminVideosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(placement?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (placement) where['placement'] = placement;
    return this.prisma.video.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  async findOne(id: string) {
    const video = await this.prisma.video.findFirst({ where: { id, deletedAt: null } });
    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  async create(dto: CreateVideoDto) {
    return this.prisma.video.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        videoUrl: dto.videoUrl,
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        placement: (dto.placement as any) ?? 'HOME',
        linkUrl: dto.linkUrl,
        duration: dto.duration,
        displayOrder: dto.displayOrder ?? 0,
        status: 'DRAFT',
        isVisible: false,
      },
    });
  }

  async update(id: string, dto: UpdateVideoDto) {
    await this.findOne(id);
    return this.prisma.video.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.video.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async publish(id: string) {
    await this.findOne(id);
    return this.prisma.video.update({ where: { id }, data: { status: EntityStatus.ACTIVE, isVisible: true, visibility: Visibility.PUBLIC } });
  }

  async unpublish(id: string) {
    await this.findOne(id);
    return this.prisma.video.update({ where: { id }, data: { status: EntityStatus.INACTIVE, isVisible: false } });
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await Promise.all(
      items.map((item) => this.prisma.video.update({ where: { id: item.id }, data: { displayOrder: item.displayOrder } })),
    );
    return { reordered: items.length };
  }
}
