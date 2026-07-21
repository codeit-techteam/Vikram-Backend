import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/database/redis.service';
import type { AdminPermission } from '../constants/admin-rbac.constants';

const ADMIN_SESSION_PREFIX = 'admin:session:';
const ADMIN_REFRESH_PREFIX = 'admin:refresh:';

export interface AdminSessionData {
  adminId: string;
  email: string;
  role: string;
  permissions: AdminPermission[];
  deviceId?: string;
  createdAt: string;
}

@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshTtlSeconds(): number {
    const expiry =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '30d';
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 30 * 24 * 60 * 60;
    }
  }

  async storeSession(
    adminId: string,
    refreshTokenHash: string,
    session: AdminSessionData,
  ): Promise<void> {
    try {
      const ttl = this.getRefreshTtlSeconds();
      const client = this.redisService.getClient();
      await client.set(
        `${ADMIN_SESSION_PREFIX}${adminId}:${refreshTokenHash}`,
        JSON.stringify(session),
        'EX',
        ttl,
      );
      await client.sadd(`${ADMIN_REFRESH_PREFIX}${adminId}`, refreshTokenHash);
      await client.expire(`${ADMIN_REFRESH_PREFIX}${adminId}`, ttl);
    } catch (error) {
      this.logger.warn(`Failed to store admin session: ${String(error)}`);
    }
  }

  async revokeSession(
    adminId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    try {
      const client = this.redisService.getClient();
      await client.del(`${ADMIN_SESSION_PREFIX}${adminId}:${refreshTokenHash}`);
      await client.srem(`${ADMIN_REFRESH_PREFIX}${adminId}`, refreshTokenHash);
    } catch (error) {
      this.logger.warn(`Failed to revoke admin session: ${String(error)}`);
    }
  }

  async revokeAllSessions(adminId: string): Promise<void> {
    try {
      const client = this.redisService.getClient();
      const hashes = await client.smembers(`${ADMIN_REFRESH_PREFIX}${adminId}`);
      if (hashes.length > 0) {
        const keys = hashes.map(
          (hash) => `${ADMIN_SESSION_PREFIX}${adminId}:${hash}`,
        );
        await client.del(...keys);
      }
      await client.del(`${ADMIN_REFRESH_PREFIX}${adminId}`);
    } catch (error) {
      this.logger.warn(`Failed to revoke all admin sessions: ${String(error)}`);
    }
  }

  async getActiveSessionCount(adminId: string): Promise<number> {
    try {
      const client = this.redisService.getClient();
      return client.scard(`${ADMIN_REFRESH_PREFIX}${adminId}`);
    } catch {
      return 0;
    }
  }
}
