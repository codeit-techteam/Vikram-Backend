import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SCHEDULER_POLL_MS } from './push.constants';
import { PushCampaignDispatchService } from './push-campaign-dispatch.service';

@Injectable()
export class PushCampaignScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushCampaignScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dispatch: PushCampaignDispatchService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, SCHEDULER_POLL_MS);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    this.logger.log(
      `Push campaign scheduler polling every ${SCHEDULER_POLL_MS}ms`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const due = await this.dispatch.processDueScheduled();
      if (due > 0) {
        this.logger.log(`Queued ${due} scheduled push campaign(s)`);
      }
    } catch (error) {
      this.logger.warn(
        `Scheduled push poll failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
