import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SCHEDULER_JOB_NAMES,
  SCHEDULER_QUEUES,
} from '../scheduler.constants';
import { DailyReportService } from '../services/report.service';
import { SchedulerLogService } from '../services/scheduler-log.service';
import { previousDay } from '../scheduler.utils';

@Processor(SCHEDULER_QUEUES.DAILY_REPORT, { concurrency: 1 })
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);

  constructor(
    private readonly dailyReportService: DailyReportService,
    private readonly schedulerLogService: SchedulerLogService,
  ) {
    super();
  }

  async process(job: Job<{ reportDate?: string }>): Promise<void> {
    if (job.name !== SCHEDULER_JOB_NAMES.GENERATE_DAILY_REPORT) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return;
    }

    const logId = await this.schedulerLogService.start({
      jobName: SCHEDULER_JOB_NAMES.GENERATE_DAILY_REPORT,
      queueName: SCHEDULER_QUEUES.DAILY_REPORT,
      bullJobId: String(job.id),
      metadata: job.data,
    });

    try {
      const reportDate = job.data?.reportDate
        ? new Date(job.data.reportDate)
        : previousDay();
      const result = await this.dailyReportService.generateDailyReport(reportDate);
      await this.schedulerLogService.finish(logId, result);
      this.logger.log(
        `Daily report done — date=${String(result.metadata?.reportDate)}`,
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
      `Job ${job?.id} failed on ${SCHEDULER_QUEUES.DAILY_REPORT}: ${error.message}`,
      error.stack,
    );
  }
}
