import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from './scheduler.constants';
import {
  buildSchedulerJobOptions,
  dayKey,
  enqueueUniqueJob,
} from './scheduler.utils';

@Injectable()
export class WalletScheduler implements OnModuleInit {
  private readonly logger = new Logger(WalletScheduler.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUES.WALLET_CLEANUP)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.configService.get<string>(
      'scheduler.walletCron',
      '0 0 2 * * 0',
    );
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.enqueue();
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob('wallet-cleanup-cron', job);
    this.logger.log(`Wallet cleanup cron registered: ${expression}`);
  }

  async enqueue(): Promise<void> {
    await enqueueUniqueJob(
      this.queue,
      SCHEDULER_JOB_NAMES.CLEANUP_WALLET_CREDITS,
      `wallet-cleanup-${dayKey()}`,
      { triggeredAt: new Date().toISOString() },
      buildSchedulerJobOptions(this.configService),
      this.logger,
    );
  }
}
