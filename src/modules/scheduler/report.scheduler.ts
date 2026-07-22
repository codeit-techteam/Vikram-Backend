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
  previousDay,
} from './scheduler.utils';

@Injectable()
export class ReportScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReportScheduler.name);

  constructor(
    @InjectQueue(SCHEDULER_QUEUES.DAILY_REPORT)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const expression = this.configService.get<string>(
      'scheduler.reportCron',
      '0 50 23 * * *',
    );
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.enqueue();
      },
      start: true,
    });
    this.schedulerRegistry.addCronJob('daily-report-cron', job);
    this.logger.log(`Daily report cron registered: ${expression}`);
  }

  async enqueue(): Promise<void> {
    const reportDate = previousDay();
    const reportDateKey = dayKey(reportDate);

    await enqueueUniqueJob(
      this.queue,
      SCHEDULER_JOB_NAMES.GENERATE_DAILY_REPORT,
      `daily-report-${reportDateKey}`,
      {
        triggeredAt: new Date().toISOString(),
        reportDate: reportDate.toISOString(),
      },
      buildSchedulerJobOptions(this.configService),
      this.logger,
    );
  }
}
