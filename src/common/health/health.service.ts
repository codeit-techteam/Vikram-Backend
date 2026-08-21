import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthResponseDto> {
    const [databaseConnected, redisConnected] = await Promise.all([
      this.prismaService.isConnected(),
      this.redisService.isConnected(),
    ]);

    if (!databaseConnected) {
      this.logger.warn(
        `HEALTH_DATABASE_DISCONNECTED env=${this.configService.get('app.env')}`,
      );
    }

    if (!redisConnected) {
      this.logger.warn(
        `HEALTH_REDIS_DISCONNECTED category=${this.redisService.getLastHealthCategory()}`,
      );
    } else if (
      this.redisService.getLastHealthCategory() === 'REDIS_RATE_LIMITED'
    ) {
      this.logger.warn('HEALTH_REDIS_RATE_LIMITED');
    }

    return {
      backend: 'Running',
      database: databaseConnected ? 'Connected' : 'Disconnected',
      redis: redisConnected ? 'Connected' : 'Disconnected',
      environment: this.configService.get<string>('app.env', 'development'),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Platform readiness (DigitalOcean) needs HTTP 200 once the process is up.
   * Dependency status stays in the JSON body for ops; a Redis blip should not
   * remove the instance from the load balancer permanently.
   */
  isHealthy(response: HealthResponseDto): boolean {
    return response.backend === 'Running';
  }
}
