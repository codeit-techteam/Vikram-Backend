import { plainToInstance } from 'class-transformer';
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
  DATABASE_URL: string;

  @IsNumber()
  @IsOptional()
  DATABASE_POOL_MAX?: number;

  @IsNumber()
  @IsOptional()
  DATABASE_POOL_IDLE_TIMEOUT_MS?: number;

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

  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

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

  @IsNumber()
  @IsOptional()
  SCHEDULER_JOB_ATTEMPTS?: number;

  @IsNumber()
  @IsOptional()
  SCHEDULER_JOB_BACKOFF_MS?: number;

  @IsNumber()
  @IsOptional()
  SCHEDULER_PROCESSOR_CONCURRENCY?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (validatedConfig.NODE_ENV === Environment.Production) {
    const redisUrl = validatedConfig.REDIS_URL?.trim();
    const redisHost = validatedConfig.REDIS_HOST?.trim();
    const placeholder = /YOUR_|CHANGE_ME|<\w+>/i;

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

  return validatedConfig;
}
