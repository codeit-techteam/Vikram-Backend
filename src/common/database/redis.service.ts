import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';
import { createRedisConnectionOptions } from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    const options = createRedisConnectionOptions(configService);

    if (url) {
      const urlOptions: RedisOptions = {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 15_000,
        family: 0,
        retryStrategy: options.retryStrategy,
      };
      this.client = new Redis(url, urlOptions);
    } else {
      this.client = new Redis(options);
    }

    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.ping();
    this.logger.log('Redis connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  getClient(): Redis {
    return this.client;
  }

  async isConnected(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
