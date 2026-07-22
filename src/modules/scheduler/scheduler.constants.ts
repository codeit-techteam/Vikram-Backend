import type { DefaultJobOptions } from 'bullmq';

export const SCHEDULER_QUEUES = {
  MEMBERSHIP_EXPIRY: 'membership-expiry',
  WALLET_CLEANUP: 'wallet-cleanup',
  LOYALTY_EXPIRY: 'loyalty-expiry',
  DAILY_REPORT: 'daily-report',
  NOTIFICATION_SCHEDULER: 'notification-scheduler',
} as const;

export type SchedulerQueueName =
  (typeof SCHEDULER_QUEUES)[keyof typeof SCHEDULER_QUEUES];

export const SCHEDULER_JOB_NAMES = {
  EXPIRE_MEMBERSHIPS: 'expire-memberships',
  CLEANUP_WALLET_CREDITS: 'cleanup-wallet-credits',
  EXPIRE_LOYALTY_POINTS: 'expire-loyalty-points',
  GENERATE_DAILY_REPORT: 'generate-daily-report',
  DISPATCH_SCHEDULED_NOTIFICATIONS: 'dispatch-scheduled-notifications',
} as const;

export const DEFAULT_SCHEDULER_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 200,
  },
};

export const ALL_SCHEDULER_QUEUES = Object.values(SCHEDULER_QUEUES);
