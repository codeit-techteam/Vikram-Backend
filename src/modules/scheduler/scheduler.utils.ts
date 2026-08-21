import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JobsOptions, Queue } from 'bullmq';
import { REDIS_BULLMQ_ENABLED } from '../../common/config/redis-bullmq.feature';
import { DEFAULT_SCHEDULER_JOB_OPTIONS } from './scheduler.constants';

export function buildSchedulerJobOptions(
  configService: ConfigService,
  overrides: JobsOptions = {},
): JobsOptions {
  const attempts = configService.get<number>('scheduler.jobAttempts', 3);
  const backoffMs = configService.get<number>('scheduler.jobBackoffMs', 5000);

  return {
    ...DEFAULT_SCHEDULER_JOB_OPTIONS,
    attempts,
    backoff: {
      type: 'exponential',
      delay: backoffMs,
    },
    ...overrides,
  };
}

/**
 * Enqueue a job with a stable jobId so horizontal replicas do not duplicate work.
 * BullMQ ignores add() when the same jobId already exists (unless finished + removed).
 */
export async function enqueueUniqueJob(
  queue: Queue,
  jobName: string,
  jobId: string,
  data: Record<string, unknown>,
  options: JobsOptions,
  logger: Logger,
): Promise<void> {
  // TEMPORARILY DISABLED - BullMQ
  if (!REDIS_BULLMQ_ENABLED) {
    logger.debug(
      `Skip enqueue ${jobName} (${jobId}) — Redis/BullMQ temporarily disabled`,
    );
    return;
  }

  // BullMQ rejects custom IDs that contain `:`.
  const safeJobId = jobId.replace(/:/g, '-');
  const existing = await queue.getJob(safeJobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'waiting' || state === 'active' || state === 'delayed') {
      logger.debug(
        `Skip enqueue ${jobName} (${safeJobId}) — already ${state}`,
      );
      return;
    }
  }

  await queue.add(jobName, data, { ...options, jobId: safeJobId });
  logger.log(`Enqueued ${jobName} → ${queue.name} (${safeJobId})`);
}

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function tenMinuteWindowKey(date = new Date()): string {
  // BullMQ custom job IDs cannot contain `:`.
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}${String(
    Math.floor(date.getMinutes() / 10) * 10,
  ).padStart(2, '0')}`;
}

export function startOfDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date = new Date()): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function previousDay(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

/** Calendar date at UTC midnight for Prisma `@db.Date` columns. */
export function toDateOnly(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}
