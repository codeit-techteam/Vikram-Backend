import { plainToInstance, Type } from 'class-transformer';
import { REDIS_BULLMQ_ENABLED } from './redis-bullmq.feature';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  APP_NAME?: string;

  @IsString()
  @IsOptional()
  API_PREFIX?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  DATABASE_PRIVATE_URL?: string;

  @IsString()
  @IsOptional()
  DATABASE_CA_CERT?: string;

  @IsString()
  @IsOptional()
  CA_CERT?: string;

  @IsString()
  @IsOptional()
  DATABASE_CA?: string;

  @IsString()
  @IsOptional()
  SCHEDULER_ENABLED?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_DRAIN_DELAY_MS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_STALLED_INTERVAL_MS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_LOCK_DURATION_MS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  DATABASE_POOL_MAX?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  DATABASE_POOL_IDLE_TIMEOUT_MS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  DATABASE_CONNECTION_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_USERNAME?: string;

  @IsString()
  @IsOptional()
  REDIS_TLS?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_DB?: number;

  @IsString()
  @IsOptional()
  SWAGGER_ENABLED?: string;

  @IsString()
  @IsOptional()
  SWAGGER_PATH?: string;

  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsString()
  @IsOptional()
  OTP_DEV_BYPASS_CODE?: string;

  @IsString()
  @IsOptional()
  MEMBERSHIP_CRON?: string;

  @IsString()
  @IsOptional()
  WALLET_CRON?: string;

  @IsString()
  @IsOptional()
  LOYALTY_CRON?: string;

  @IsString()
  @IsOptional()
  REPORT_CRON?: string;

  @IsString()
  @IsOptional()
  NOTIFICATION_CRON?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_JOB_ATTEMPTS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_JOB_BACKOFF_MS?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  SCHEDULER_PROCESSOR_CONCURRENCY?: number;
}

const NUMERIC_ENV_KEYS = [
  'PORT',
  'DATABASE_POOL_MAX',
  'DATABASE_POOL_IDLE_TIMEOUT_MS',
  'DATABASE_CONNECTION_TIMEOUT_MS',
  'REDIS_PORT',
  'REDIS_DB',
  'SCHEDULER_JOB_ATTEMPTS',
  'SCHEDULER_JOB_BACKOFF_MS',
  'SCHEDULER_PROCESSOR_CONCURRENCY',
  'SCHEDULER_DRAIN_DELAY_MS',
  'SCHEDULER_STALLED_INTERVAL_MS',
  'SCHEDULER_LOCK_DURATION_MS',
] as const;

export function validate(config: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...config };
  for (const key of NUMERIC_ENV_KEYS) {
    if (normalized[key] === '') {
      delete normalized[key];
    }
  }

  const validatedConfig = plainToInstance(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (
    !validatedConfig.DATABASE_URL?.trim() &&
    !validatedConfig.DATABASE_PRIVATE_URL?.trim()
  ) {
    throw new Error(
      'DATABASE_URL (or DATABASE_PRIVATE_URL) is required.',
    );
  }

  if (validatedConfig.NODE_ENV === Environment.Production) {
    const redisUrl = validatedConfig.REDIS_URL?.trim();
    const redisHost = validatedConfig.REDIS_HOST?.trim();
    const placeholder = /YOUR_|CHANGE_ME|<\w+>/i;
    const databaseUrl =
      validatedConfig.DATABASE_URL?.trim() ||
      validatedConfig.DATABASE_PRIVATE_URL?.trim() ||
      '';

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL (or DATABASE_PRIVATE_URL) is required in production.',
      );
    }
    if (placeholder.test(databaseUrl) || databaseUrl.includes('${')) {
      throw new Error(
        'DATABASE_BINDABLE_URL_UNRESOLVED: DATABASE_URL is a placeholder or unresolved bindable variable. ' +
          'On DigitalOcean App Platform set DATABASE_URL as a bindable value such as ' +
          '${db-pgsql-blr1-63888.DATABASE_PRIVATE_URL} or ${db-pgsql-blr1-63888.DATABASE_URL}.',
      );
    }
    if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
      throw new Error(
        'DATABASE_URL must start with postgresql:// or postgres://.',
      );
    }
    try {
      const host = new URL(databaseUrl).hostname;
      if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        throw new Error(
          'Production DATABASE_URL must not use localhost. Use the DigitalOcean Managed PostgreSQL host.',
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('Production DATABASE_URL') ||
          error.message.startsWith('DATABASE_BINDABLE_URL_UNRESOLVED'))
      ) {
        throw error;
      }
      throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.');
    }

    // TEMPORARILY DISABLED — production boot must not require Redis.
    if (REDIS_BULLMQ_ENABLED) {
      if (redisUrl) {
        if (placeholder.test(redisUrl) || redisUrl.includes('${')) {
          throw new Error(
            'REDIS_URL is invalid. Use a redis:// or rediss:// connection string from DigitalOcean Managed Redis.',
          );
        }
      } else if (
        !redisHost ||
        placeholder.test(redisHost) ||
        redisHost === 'localhost'
      ) {
        throw new Error(
          'Production Redis is not configured. Set REDIS_URL (preferred, rediss://...) or a real REDIS_HOST. YOUR_REDIS_HOST is a placeholder from .env.example and will not resolve.',
        );
      }
    }
  }

  return validatedConfig;
}
