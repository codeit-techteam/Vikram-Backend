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
export class MembershipScheduler implements OnModuleInit {
  private readonly logger = new Logger(MembershipScheduler.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.configService.get<string>(
      'scheduler.membershipCron',
      '0 30 0 * * *',
    );
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.enqueue();
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob('membership-expiry-cron', job);
    this.logger.log(`Membership expiry cron registered: ${expression}`);
  }

  async enqueue(): Promise<void> {
    await enqueueUniqueJob(
      this.queue,
      SCHEDULER_JOB_NAMES.EXPIRE_MEMBERSHIPS,
      `membership-expiry-${dayKey()}`,
      { triggeredAt: new Date().toISOString() },
      buildSchedulerJobOptions(this.configService),
      this.logger,
    );
  }
}
