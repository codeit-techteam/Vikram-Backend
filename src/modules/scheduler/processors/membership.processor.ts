import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from '../scheduler.constants';
import { MembershipExpiryService } from '../services/membership.service';
import { SchedulerLogService } from '../services/scheduler-log.service';

@Processor(SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY, { concurrency: 2 })
export class MembershipProcessor extends WorkerHost {
  private readonly logger = new Logger(MembershipProcessor.name);

  constructor(
    private readonly membershipExpiryService: MembershipExpiryService,
    private readonly schedulerLogService: SchedulerLogService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULER_JOB_NAMES.EXPIRE_MEMBERSHIPS) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }

    const logId = await this.schedulerLogService.start({
      jobName: SCHEDULER_JOB_NAMES.EXPIRE_MEMBERSHIPS,
      queueName: SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY,
      bullJobId: String(job.id),
    });

    try {
      const result = await this.membershipExpiryService.expireMemberships();
      await this.schedulerLogService.finish(logId, result);
      this.logger.log(
        `Membership expiry done — processed=${result.processedCount} success=${result.successCount} failed=${result.failedCount}`,
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
      `Job ${job?.id} failed on ${SCHEDULER_QUEUES.MEMBERSHIP_EXPIRY}: ${error.message}`,
      error.stack,
    );
  }
}
