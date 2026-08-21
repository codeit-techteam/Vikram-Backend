import type { ConfigService } from '@nestjs/config';
import type { WorkerOptions } from 'bullmq';

/**
 * BullMQ defaults poll empty queues every ~5ms (drainDelay), which burns
 * managed Redis request quotas (DigitalOcean max requests limit).
 * These settings keep workers responsive without continuous EVALSHA spam.
 */
export function buildBullMqWorkerOptions(
  configService: ConfigService,
): Pick<
  WorkerOptions,
  'concurrency' | 'drainDelay' | 'stalledInterval' | 'lockDuration'
> {
  return {
    concurrency: configService.get<number>('scheduler.processorConcurrency', 1),
    drainDelay: configService.get<number>('scheduler.drainDelayMs', 5000),
    stalledInterval: configService.get<number>(
      'scheduler.stalledIntervalMs',
      120_000,
    ),
    lockDuration: configService.get<number>('scheduler.lockDurationMs', 60_000),
  };
}
