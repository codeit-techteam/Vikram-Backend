import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { REDIS_BULLMQ_ENABLED } from '../../common/config/redis-bullmq.feature';
import { NotificationModule } from '../notification/notification.module';
import {
  ALL_SCHEDULER_QUEUES,
  DEFAULT_SCHEDULER_JOB_OPTIONS,
} from './scheduler.constants';
import { SchedulerStatusController } from './scheduler-status.controller';
import {
  SchedulerStatusDisabledService,
  SchedulerStatusService,
} from './scheduler-status.service';
import { MembershipProcessor } from './processors/membership.processor';
import { LoyaltyProcessor } from './processors/loyalty.processor';
import { ReportProcessor } from './processors/report.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { MembershipScheduler } from './membership.scheduler';
import { LoyaltyScheduler } from './loyalty.scheduler';
import { ReportScheduler } from './report.scheduler';
import { NotificationScheduler } from './notification.scheduler';
import { MembershipExpiryService } from './services/membership.service';
import { LoyaltyExpiryService } from './services/loyalty.service';
import { DailyReportService } from './services/report.service';
import { ScheduledNotificationDispatchService } from './services/notification.service';
import { SchedulerLogService } from './services/scheduler-log.service';

const logger = new Logger('SchedulerModule');

/*
TEMPORARILY DISABLED:
BullMQ workers, queue registration, and cron schedulers when Redis/BullMQ is off.

Reason:
Core backend must operate without Redis/BullMQ.
Re-enable after Redis infrastructure is restored.
*/
const schedulerEnabled =
  REDIS_BULLMQ_ENABLED && process.env.SCHEDULER_ENABLED !== 'false';

if (!REDIS_BULLMQ_ENABLED) {
  logger.warn(
    'Redis/BullMQ temporarily disabled — BullMQ queues and workers are not registered.',
  );
} else if (!schedulerEnabled) {
  logger.warn(
    'SCHEDULER_ENABLED=false — BullMQ workers and Nest cron schedulers are not registered (Redis quota relief).',
  );
}

const schedulerRuntimeProviders = schedulerEnabled
  ? [
      MembershipProcessor,
      LoyaltyProcessor,
      ReportProcessor,
      NotificationProcessor,
      MembershipScheduler,
      LoyaltyScheduler,
      ReportScheduler,
      NotificationScheduler,
    ]
  : [];

/*
TEMPORARILY DISABLED:
BullModule.registerQueue(...) when Redis/BullMQ is off.
*/
const bullMqImports = REDIS_BULLMQ_ENABLED
  ? [
      BullModule.registerQueue(
        ...ALL_SCHEDULER_QUEUES.map((name) => ({
          name,
          defaultJobOptions: DEFAULT_SCHEDULER_JOB_OPTIONS,
        })),
      ),
    ]
  : [];

@Module({
  imports: [
    ...(schedulerEnabled ? [ScheduleModule.forRoot()] : []),
    NotificationModule,
    ...bullMqImports,
  ],
  controllers: [SchedulerStatusController],
  providers: [
    SchedulerLogService,
    MembershipExpiryService,
    LoyaltyExpiryService,
    DailyReportService,
    ScheduledNotificationDispatchService,
    ...schedulerRuntimeProviders,
    REDIS_BULLMQ_ENABLED
      ? SchedulerStatusService
      : {
          provide: SchedulerStatusService,
          useClass: SchedulerStatusDisabledService,
        },
  ],
  exports: [
    ...(REDIS_BULLMQ_ENABLED ? [BullModule] : []),
    SchedulerLogService,
    MembershipExpiryService,
    LoyaltyExpiryService,
    DailyReportService,
    ScheduledNotificationDispatchService,
  ],
})
export class SchedulerModule {}
