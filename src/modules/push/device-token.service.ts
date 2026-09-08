import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DevicePlatform } from '../../../generated/prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export interface UpsertDeviceTokenInput {
  token: string;
  platform?: DevicePlatform | string;
  deviceId?: string;
  appVersion?: string;
}

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(
    customerId: string,
    input: UpsertDeviceTokenInput,
  ): Promise<{ id: string; token: string; platform: DevicePlatform }> {
    const token = input.token?.trim();
    if (!token) {
      throw new BadRequestException('Device token is required');
    }
    const platform = this.parsePlatform(input.platform);
    const now = new Date();

    const existing = await this.prisma.notificationToken.findUnique({
      where: { token },
    });

    if (existing) {
      const updated = await this.prisma.notificationToken.update({
        where: { token },
        data: {
          customerId,
          platform,
          deviceId: input.deviceId ?? existing.deviceId,
          appVersion: input.appVersion ?? existing.appVersion,
          isActive: true,
          lastSeenAt: now,
        },
      });
      await this.syncDeviceSession(customerId, {
        ...input,
        token,
        platform,
      });
      return { id: updated.id, token: updated.token, platform: updated.platform };
    }

    const created = await this.prisma.notificationToken.create({
      data: {
        customerId,
        token,
        platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        isActive: true,
        lastSeenAt: now,
      },
    });

    await this.syncDeviceSession(customerId, {
      ...input,
      token,
      platform,
    });

    this.logger.debug(`Registered FCM token for customer ${customerId}`);
    return { id: created.id, token: created.token, platform: created.platform };
  }

  /**
   * On logout: keep the row so another user can claim the device,
   * but stop delivering to this customer.
   */
  async release(
    customerId: string,
    input: { token?: string; deviceId?: string },
  ): Promise<{ released: number }> {
    const where =
      input.token || input.deviceId
        ? {
            customerId,
            isActive: true,
            ...(input.token ? { token: input.token } : {}),
            ...(input.deviceId ? { deviceId: input.deviceId } : {}),
          }
        : { customerId, isActive: true };

    const result = await this.prisma.notificationToken.updateMany({
      where,
      data: { isActive: false },
    });

    return { released: result.count };
  }

  async countActiveSubscribers(): Promise<number> {
    const grouped = await this.prisma.notificationToken.groupBy({
      by: ['customerId'],
      where: { isActive: true },
    });
    return grouped.length;
  }

  private parsePlatform(value?: DevicePlatform | string): DevicePlatform {
    const normalized = String(value ?? 'ANDROID').toUpperCase();
    if (normalized === 'IOS') return DevicePlatform.IOS;
    if (normalized === 'WEB') return DevicePlatform.WEB;
    return DevicePlatform.ANDROID;
  }

  private async syncDeviceSession(
    customerId: string,
    input: UpsertDeviceTokenInput & { platform: DevicePlatform },
  ): Promise<void> {
    if (!input.deviceId) return;
    await this.prisma.deviceSession.upsert({
      where: {
        customerId_deviceId: { customerId, deviceId: input.deviceId },
      },
      create: {
        customerId,
        deviceId: input.deviceId,
        fcmToken: input.token,
        platform: input.platform,
        lastLogin: new Date(),
      },
      update: {
        fcmToken: input.token,
        platform: input.platform,
        lastLogin: new Date(),
      },
    });
  }
}
