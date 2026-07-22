import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from '../scheduler.constants';
import { WalletCleanupService } from '../services/wallet.service';
import { SchedulerLogService } from '../services/scheduler-log.service';

@Processor(SCHEDULER_QUEUES.WALLET_CLEANUP, { concurrency: 2 })
export class WalletProcessor extends WorkerHost {
  private readonly logger = new Logger(WalletProcessor.name);

  constructor(
    private readonly walletCleanupService: WalletCleanupService,
    private readonly schedulerLogService: SchedulerLogService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SCHEDULER_JOB_NAMES.CLEANUP_WALLET_CREDITS) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }

    const logId = await this.schedulerLogService.start({
      jobName: SCHEDULER_JOB_NAMES.CLEANUP_WALLET_CREDITS,
      queueName: SCHEDULER_QUEUES.WALLET_CLEANUP,
      bullJobId: String(job.id),
    });

    try {
      const result = await this.walletCleanupService.cleanupExpiredCredits();
      await this.schedulerLogService.finish(logId, result);
      this.logger.log(
        `Wallet cleanup done — processed=${result.processedCount} success=${result.successCount} failed=${result.failedCount}`,
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
      `Job ${job?.id} failed on ${SCHEDULER_QUEUES.WALLET_CLEANUP}: ${error.message}`,
      error.stack,
    );
  }
}
