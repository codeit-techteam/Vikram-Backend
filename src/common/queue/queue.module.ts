import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { REDIS_BULLMQ_ENABLED } from '../config/redis-bullmq.feature';
import { createRedisConnectionOptions } from '../config/redis.config';

/*
TEMPORARILY DISABLED:
BullMQ/Redis queue registration when REDIS_BULLMQ_ENABLED is false.

Reason:
Core backend must operate without Redis/BullMQ.
Re-enable after Redis infrastructure is restored.
*/
const bullMqImports = REDIS_BULLMQ_ENABLED
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const url = configService.get<string>('redis.url');
          const base = createRedisConnectionOptions(configService);
          // Prefer REDIS_URL so rediss:// TLS is applied consistently with RedisService.
          const connection = url
            ? {
                url,
                maxRetriesPerRequest: null as null,
                enableReadyCheck: true,
                connectTimeout: 15_000,
                family: 0 as const,
                retryStrategy: base.retryStrategy,
                ...(configService.get<boolean>('redis.tls') ? { tls: {} } : {}),
              }
            : base;

          return {
            connection,
            defaultJobOptions: {
              removeOnComplete: { count: 20 },
              removeOnFail: { count: 50 },
            },
          };
        },
      }),
    ]
  : [];

@Module({
  imports: bullMqImports,
  exports: REDIS_BULLMQ_ENABLED ? [BullModule] : [],
})
export class QueueModule {}
