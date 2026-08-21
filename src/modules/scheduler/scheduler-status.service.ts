import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { SCHEDULER_JOB_NAMES, SCHEDULER_QUEUES } from './scheduler.constants';
import { SchedulerLogService } from './services/scheduler-log.service';

export interface QueueStatusDto {
  name: string;
  jobName: string;
  cronExpression: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
  lastRun: {
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    processedCount: number;
    successCount: number;
    failedCount: number;
    status: string | null;
    error: string | null;
  } | null;
  nextRun: string | null;
}

@Injectable()
export class SchedulerStatusService {
  constructor(
    @InjectQueue(SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY)
    private readonly membershipQueue: Queue,
    @InjectQueue(SCHEDULER_QUEUES.LOYALTY_EXPIRY)
    private readonly loyaltyQueue: Queue,
    @InjectQueue(SCHEDULER_QUEUES.DAILY_REPORT)
    private readonly reportQueue: Queue,
    @InjectQueue(SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER)
    private readonly notificationQueue: Queue,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly schedulerLogService: SchedulerLogService,
  ) {}

  async getStatus(): Promise<{
    generatedAt: string;
    queues: QueueStatusDto[];
  }> {
    const definitions = [
      {
        queue: this.membershipQueue,
        name: SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY,
        jobName: SCHEDULER_JOB_NAMES.EXPIRE_MEMBERSHIPS,
        cronKey: 'scheduler.membershipCron',
        cronDefault: '0 30 0 * * *',
        cronJobName: 'membership-expiry-cron',
      },
      {
        queue: this.loyaltyQueue,
        name: SCHEDULER_QUEUES.LOYALTY_EXPIRY,
        jobName: SCHEDULER_JOB_NAMES.EXPIRE_LOYALTY_POINTS,
        cronKey: 'scheduler.loyaltyCron',
        cronDefault: '0 0 1 * * *',
        cronJobName: 'loyalty-expiry-cron',
      },
      {
        queue: this.reportQueue,
        name: SCHEDULER_QUEUES.DAILY_REPORT,
        jobName: SCHEDULER_JOB_NAMES.GENERATE_DAILY_REPORT,
        cronKey: 'scheduler.reportCron',
        cronDefault: '0 50 23 * * *',
        cronJobName: 'daily-report-cron',
      },
      {
        queue: this.notificationQueue,
        name: SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER,
        jobName: SCHEDULER_JOB_NAMES.DISPATCH_SCHEDULED_NOTIFICATIONS,
        cronKey: 'scheduler.notificationCron',
        cronDefault: '*/10 * * * *',
        cronJobName: 'notification-scheduler-cron',
      },
    ];

    const latestLogs = await this.schedulerLogService.getLatestByJobNames(
      definitions.map((d) => d.jobName),
    );

    const queues: QueueStatusDto[] = [];

    for (const def of definitions) {
      const [waiting, active, delayed, completed, failed, isPaused] =
        await Promise.all([
          def.queue.getWaitingCount(),
          def.queue.getActiveCount(),
          def.queue.getDelayedCount(),
          def.queue.getCompletedCount(),
          def.queue.getFailedCount(),
          def.queue.isPaused(),
        ]);

      const last = latestLogs.get(def.jobName) ?? null;

      queues.push({
        name: def.name,
        jobName: def.jobName,
        cronExpression: this.configService.get<string>(
          def.cronKey,
          def.cronDefault,
        ),
        waiting,
        active,
        delayed,
        completed,
        failed,
        paused: isPaused,
        lastRun: last
          ? {
              startedAt: last.startedAt.toISOString(),
              finishedAt: last.finishedAt?.toISOString() ?? null,
              durationMs: last.durationMs,
              processedCount: last.processedCount,
              successCount: last.successCount,
              failedCount: last.failedCount,
              status: last.status,
              error: last.error,
            }
          : null,
        nextRun: this.getNextRun(def.cronJobName),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      queues,
    };
  }

  private getNextRun(cronJobName: string): string | null {
    try {
      const job = this.schedulerRegistry.getCronJob(cronJobName);
      const next = job.nextDate();
      return next.toJSDate().toISOString();
    } catch {
      return null;
    }
  }
}

/** Returns a static snapshot when Redis/BullMQ is temporarily disabled. */
@Injectable()
export class SchedulerStatusDisabledService {
  async getStatus(): Promise<{
    generatedAt: string;
    queues: QueueStatusDto[];
    redisBullMq: 'Disabled';
  }> {
    return {
      generatedAt: new Date().toISOString(),
      queues: [],
      redisBullMq: 'Disabled',
    };
  }
}
