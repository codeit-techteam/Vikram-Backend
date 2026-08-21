import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import { SCHEDULER_JOB_NAMES, SCHEDULER_QUEUES } from './scheduler.constants';
import {
  buildSchedulerJobOptions,
  enqueueUniqueJob,
  tenMinuteWindowKey,
} from './scheduler.utils';

@Injectable()
export class NotificationScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.configService.get<string>(
      'scheduler.notificationCron',
      '0 */30 * * * *',
    );
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.enqueue();
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob('notification-scheduler-cron', job);
    this.logger.log(`Notification scheduler cron registered: ${expression}`);
  }

  async enqueue(): Promise<void> {
    try {
      await enqueueUniqueJob(
        this.queue,
        SCHEDULER_JOB_NAMES.DISPATCH_SCHEDULED_NOTIFICATIONS,
        `notification-scheduler-${tenMinuteWindowKey()}`,
        { triggeredAt: new Date().toISOString() },
        buildSchedulerJobOptions(this.configService),
        this.logger,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue notification scheduler job: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
