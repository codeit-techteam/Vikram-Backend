import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { HubProfileUpdateDto } from '../dto/hub.dto';

@Injectable()
export class HubProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(hubId: string) {
    const hub = await this.prisma.hub.findFirst({
      where: { id: hubId, deletedAt: null },
    });
    if (!hub) throw new NotFoundException('Hub not found');
    return hub;
  }

  async updateProfile(hubId: string, dto: HubProfileUpdateDto, userId: string) {
    await this.getProfile(hubId);

    if (dto.fullName || dto.phone || dto.email) {
      await this.prisma.hubUser.update({
        where: { id: userId },
        data: {
          ...(dto.fullName && { fullName: dto.fullName }),
          ...(dto.phone && { phone: dto.phone }),
          ...(dto.email && { email: dto.email.toLowerCase() }),
        },
      });
    }

    return this.getProfile(hubId);
  }
}
