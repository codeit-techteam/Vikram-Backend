import { Injectable, Logger } from '@nestjs/common';
import { SchedulerJobStatus } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';

export interface JobRunResult {
  processedCount: number;
  successCount: number;
  failedCount: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SchedulerLogService {
  private readonly logger = new Logger(SchedulerLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(params: {
    jobName: string;
    queueName: string;
    bullJobId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const log = await this.prisma.schedulerJobLog.create({
      data: {
        jobName: params.jobName,
        queueName: params.queueName,
        bullJobId: params.bullJobId ?? null,
        startedAt: new Date(),
        status: SchedulerJobStatus.RUNNING,
        metadata: params.metadata
          ? JSON.parse(JSON.stringify(params.metadata))
          : undefined,
      },
    });
    return log.id;
  }

  async finish(
    logId: string,
    result: JobRunResult,
    error?: string,
  ): Promise<void> {
    const finishedAt = new Date();
    const existing = await this.prisma.schedulerJobLog.findUnique({
      where: { id: logId },
    });

    if (!existing) {
      this.logger.warn(`Scheduler job log ${logId} not found`);
      return;
    }

    await this.prisma.schedulerJobLog.update({
      where: { id: logId },
      data: {
        finishedAt,
        durationMs: finishedAt.getTime() - existing.startedAt.getTime(),
        processedCount: result.processedCount,
        successCount: result.successCount,
        failedCount: result.failedCount,
        status: error ? SchedulerJobStatus.FAILED : SchedulerJobStatus.SUCCESS,
        error: error ?? null,
        metadata: result.metadata
          ? JSON.parse(JSON.stringify(result.metadata))
          : existing.metadata ?? undefined,
      },
    });
  }

  async getLatestByJobNames(jobNames: string[]) {
    const logs = await this.prisma.schedulerJobLog.findMany({
      where: { jobName: { in: jobNames } },
      orderBy: { startedAt: 'desc' },
      take: jobNames.length * 3,
    });

    const latest = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      if (!latest.has(log.jobName)) {
        latest.set(log.jobName, log);
      }
    }
    return latest;
  }
}
