import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationModule } from '../notification/notification.module';
import {
  ALL_SCHEDULER_QUEUES,
  DEFAULT_SCHEDULER_JOB_OPTIONS,
} from './scheduler.constants';
import { SchedulerStatusController } from './scheduler-status.controller';
import { SchedulerStatusService } from './scheduler-status.service';
import { MembershipProcessor } from './processors/membership.processor';
import { WalletProcessor } from './processors/wallet.processor';
import { LoyaltyProcessor } from './processors/loyalty.processor';
import { ReportProcessor } from './processors/report.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { MembershipScheduler } from './membership.scheduler';
import { WalletScheduler } from './wallet.scheduler';
import { LoyaltyScheduler } from './loyalty.scheduler';
import { ReportScheduler } from './report.scheduler';
import { NotificationScheduler } from './notification.scheduler';
import { MembershipExpiryService } from './services/membership.service';
import { WalletCleanupService } from './services/wallet.service';
import { LoyaltyExpiryService } from './services/loyalty.service';
import { DailyReportService } from './services/report.service';
import { ScheduledNotificationDispatchService } from './services/notification.service';
import { SchedulerLogService } from './services/scheduler-log.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificationModule,
    BullModule.registerQueue(
      ...ALL_SCHEDULER_QUEUES.map((name) => ({
        name,
        defaultJobOptions: DEFAULT_SCHEDULER_JOB_OPTIONS,
      })),
    ),
  ],
  controllers: [SchedulerStatusController],
  providers: [
    SchedulerLogService,
    MembershipExpiryService,
    WalletCleanupService,
    LoyaltyExpiryService,
    DailyReportService,
    ScheduledNotificationDispatchService,
    MembershipProcessor,
    WalletProcessor,
    LoyaltyProcessor,
    ReportProcessor,
    NotificationProcessor,
    MembershipScheduler,
    WalletScheduler,
    LoyaltyScheduler,
    ReportScheduler,
    NotificationScheduler,
    SchedulerStatusService,
  ],
  exports: [
    BullModule,
    SchedulerLogService,
    MembershipExpiryService,
    WalletCleanupService,
    LoyaltyExpiryService,
    DailyReportService,
    ScheduledNotificationDispatchService,
  ],
})
export class SchedulerModule {}
