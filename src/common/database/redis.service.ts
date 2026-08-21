import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import { createRedisConnectionOptions } from '../config/redis.config';
import {
  classifyRedisError,
  formatRedisDiagnostic,
} from './redis-errors';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly host: string;
  private readonly port: number;
  private readonly tls: boolean;
  private readonly nodeEnv: string;
  private lastHealthCategory:
    | 'REDIS_CONNECTED'
    | 'REDIS_TIMEOUT'
    | 'REDIS_AUTH_FAILED'
    | 'REDIS_RATE_LIMITED'
    | 'REDIS_CONNECTION_FAILED' = 'REDIS_CONNECTION_FAILED';

  constructor(private readonly configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    const options = createRedisConnectionOptions(configService);
    this.host = configService.get<string>('redis.host', 'localhost');
    this.port = configService.get<number>('redis.port', 6379);
    this.tls = configService.get<boolean>('redis.tls', false);
    this.nodeEnv = configService.get<string>('app.env', 'development');

    if (url) {
      const urlOptions: RedisOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 15_000,
        family: 0,
        retryStrategy: options.retryStrategy,
        ...(this.tls ? { tls: {} } : {}),
      };
      this.client = new Redis(url, urlOptions);
    } else {
      this.client = new Redis(options);
    }

    this.client.on('error', (error: Error) => {
      const diagnostic = classifyRedisError(error);
      this.lastHealthCategory = diagnostic.category;
      this.logger.warn(
        formatRedisDiagnostic(diagnostic, {
          host: this.host,
          port: this.port,
          tls: this.tls,
          environment: this.nodeEnv,
        }),
      );
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.ping();
      this.lastHealthCategory = 'REDIS_CONNECTED';
      this.logger.log(
        `REDIS_CONNECTED host=${this.host} port=${this.port} tls=${this.tls}`,
      );
    } catch (error) {
      const diagnostic = classifyRedisError(error);
      this.lastHealthCategory = diagnostic.category;
      this.logger.error(
        formatRedisDiagnostic(diagnostic, {
          host: this.host,
          port: this.port,
          tls: this.tls,
          environment: this.nodeEnv,
        }),
      );
      // Allow boot so /health can report Redis status; auth may still work without Redis.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  getClient(): Redis {
    return this.client;
  }

  getLastHealthCategory(): string {
    return this.lastHealthCategory;
  }

  async isConnected(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      if (pong === 'PONG') {
        this.lastHealthCategory = 'REDIS_CONNECTED';
        return true;
      }
      this.lastHealthCategory = 'REDIS_CONNECTION_FAILED';
      return false;
    } catch (error) {
      const diagnostic = classifyRedisError(error);
      this.lastHealthCategory = diagnostic.category;
      this.logger.warn(
        formatRedisDiagnostic(diagnostic, {
          host: this.host,
          port: this.port,
          tls: this.tls,
          environment: this.nodeEnv,
        }),
      );
      return false;
    }
  }
}
