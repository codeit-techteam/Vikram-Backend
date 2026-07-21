import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export type RedisConnectionOptions = Pick<
  RedisOptions,
  'host' | 'port' | 'password' | 'db' | 'maxRetriesPerRequest'
>;

export function createRedisConnectionOptions(
  configService: ConfigService,
): RedisConnectionOptions {
  const password = configService.get<string>('redis.password');

  return {
    host: configService.get<string>('redis.host', 'localhost'),
    port: configService.get<number>('redis.port', 6379),
    ...(password ? { password } : {}),
    db: configService.get<number>('redis.db', 0),
    maxRetriesPerRequest: null,
  };
}
