import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import { REDIS_BULLMQ_ENABLED } from './redis-bullmq.feature';

const PLACEHOLDER_PATTERN = /YOUR_|CHANGE_ME|<\w+>/i;

export type RedisConnectionOptions = Pick<
  RedisOptions,
  | 'host'
  | 'port'
  | 'username'
  | 'password'
  | 'db'
  | 'tls'
  | 'family'
  | 'maxRetriesPerRequest'
  | 'enableReadyCheck'
  | 'connectTimeout'
  | 'retryStrategy'
>;

export type ResolvedRedisConfig = {
  url?: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
};

export function isPlaceholderRedisValue(value?: string): boolean {
  return Boolean(value && PLACEHOLDER_PATTERN.test(value));
}

export function resolveRedisFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedRedisConfig {
  // TEMPORARILY DISABLED — skip Redis env resolution when BullMQ/Redis is off.
  if (!REDIS_BULLMQ_ENABLED) {
    return {
      host: 'disabled',
      port: 6379,
      db: 0,
      tls: false,
    };
  }

  const redisUrl = env.REDIS_URL?.trim();

  if (redisUrl) {
    if (isPlaceholderRedisValue(redisUrl) || redisUrl.includes('${')) {
      throw new Error(
        'REDIS_URL is a placeholder or unresolved bind variable. Set it to a redis:// or rediss:// connection string.',
      );
    }

    const parsed = new URL(redisUrl);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      throw new Error(
        'REDIS_URL must start with redis:// or rediss:// (Upstash uses rediss://).',
      );
    }

    const dbFromPath = parsed.pathname.replace('/', '');
    return {
      url: redisUrl,
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db: dbFromPath ? parseInt(dbFromPath, 10) || 0 : 0,
      tls: parsed.protocol === 'rediss:' || env.REDIS_TLS === 'true',
    };
  }

  const host = env.REDIS_HOST?.trim() || 'localhost';
  if (isPlaceholderRedisValue(host)) {
    throw new Error(
      'REDIS_HOST is still a placeholder (for example YOUR_REDIS_HOST). Set REDIS_URL or a real Redis hostname.',
    );
  }

  return {
    host,
    port: parseInt(env.REDIS_PORT ?? '6379', 10),
    username: env.REDIS_USERNAME || undefined,
    password: env.REDIS_PASSWORD || undefined,
    db: parseInt(env.REDIS_DB ?? '0', 10),
    tls: env.REDIS_TLS === 'true',
  };
}

/**
 * Discrete connection options for ioredis + BullMQ.
 * `family: 0` avoids IPv6 DNS failures to Upstash from App Platform.
 */
export function createRedisConnectionOptions(
  configService: ConfigService,
): RedisConnectionOptions {
  const password = configService.get<string>('redis.password');
  const username = configService.get<string>('redis.username');
  const tls = configService.get<boolean>('redis.tls');

  return {
    host: configService.get<string>('redis.host', 'localhost'),
    port: configService.get<number>('redis.port', 6379),
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    db: configService.get<number>('redis.db', 0),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 15_000,
    family: 0,
    retryStrategy(times) {
      if (times > 10) {
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    ...(tls ? { tls: {} } : {}),
  };
}
