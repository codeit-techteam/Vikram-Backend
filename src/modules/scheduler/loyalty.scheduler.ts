import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { SCHEDULER_JOB_NAMES, SCHEDULER_QUEUES } from './scheduler.constants';
import {
  buildSchedulerJobOptions,
  dayKey,
  enqueueUniqueJob,
} from './scheduler.utils';

@Injectable()
export class LoyaltyScheduler implements OnModuleInit {
  private readonly logger = new Logger(LoyaltyScheduler.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUES.LOYALTY_EXPIRY)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.configService.get<string>(
      'scheduler.loyaltyCron',
      '0 0 1 * * *',
    );
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.enqueue();
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob('loyalty-expiry-cron', job);
    this.logger.log(`Loyalty expiry cron registered: ${expression}`);
  }

  async enqueue(): Promise<void> {
    await enqueueUniqueJob(
      this.queue,
      SCHEDULER_JOB_NAMES.EXPIRE_LOYALTY_POINTS,
      `loyalty-expiry-${dayKey()}`,
      { triggeredAt: new Date().toISOString() },
      buildSchedulerJobOptions(this.configService),
      this.logger,
    );
  }
}
