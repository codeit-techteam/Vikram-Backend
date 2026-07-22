import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from '../scheduler.constants';
import { LoyaltyExpiryService } from '../services/loyalty.service';
import { SchedulerLogService } from '../services/scheduler-log.service';

@Processor(SCHEDULER_QUEUES.LOYALTY_EXPIRY, { concurrency: 2 })
export class LoyaltyProcessor extends WorkerHost {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(
    private readonly loyaltyExpiryService: LoyaltyExpiryService,
    private readonly schedulerLogService: SchedulerLogService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULER_JOB_NAMES.EXPIRE_LOYALTY_POINTS) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }

    const logId = await this.schedulerLogService.start({
      jobName: SCHEDULER_JOB_NAMES.EXPIRE_LOYALTY_POINTS,
      queueName: SCHEDULER_QUEUES.LOYALTY_EXPIRY,
      bullJobId: String(job.id),
    });

    try {
      const result = await this.loyaltyExpiryService.expireLoyaltyPoints();
      await this.schedulerLogService.finish(logId, result);
      this.logger.log(
        `Loyalty expiry done — processed=${result.processedCount} success=${result.successCount} failed=${result.failedCount}`,
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
      `Job ${job?.id} failed on ${SCHEDULER_QUEUES.LOYALTY_EXPIRY}: ${error.message}`,
      error.stack,
    );
  }
}
