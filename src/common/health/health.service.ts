import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
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

    return {
      backend: 'Running',
      database: databaseConnected ? 'Connected' : 'Disconnected',
      redis: redisConnected ? 'Connected' : 'Disconnected',
      environment: this.configService.get<string>('app.env', 'development'),
      timestamp: new Date().toISOString(),
    };
  }

  isHealthy(response: HealthResponseDto): boolean {
    return response.database === 'Connected' && response.redis === 'Connected';
  }
}
