import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from '../scheduler.constants';
import { ScheduledNotificationDispatchService } from '../services/notification.service';
import { SchedulerLogService } from '../services/scheduler-log.service';

@Processor(SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER, { concurrency: 2 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly dispatchService: ScheduledNotificationDispatchService,
    private readonly schedulerLogService: SchedulerLogService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULER_JOB_NAMES.DISPATCH_SCHEDULED_NOTIFICATIONS) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }

    const logId = await this.schedulerLogService.start({
      jobName: SCHEDULER_JOB_NAMES.DISPATCH_SCHEDULED_NOTIFICATIONS,
      queueName: SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER,
      bullJobId: String(job.id),
    });

    try {
      const result = await this.dispatchService.dispatchDueNotifications();
      await this.schedulerLogService.finish(logId, result);
      this.logger.log(
        `Notification dispatch done — processed=${result.processedCount} success=${result.successCount} failed=${result.failedCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.schedulerLogService.finish(
        logId,
        { processedCount: 0, successCount: 0, failedCount: 1 },
        message,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Job ${job?.id} failed on ${SCHEDULER_QUEUES.NOTIFICATION_SCHEDULER}: ${error.message}`,
      error.stack,
    );
  }
}
