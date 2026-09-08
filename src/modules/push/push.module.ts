import { Module } from '@nestjs/common';
import { AudienceResolverService } from './audience-resolver.service';
import { DeviceTokenService } from './device-token.service';
import { FcmPushService } from './fcm-push.service';
import { PushCampaignDispatchService } from './push-campaign-dispatch.service';
import { PushCampaignScheduler } from './push-campaign.scheduler';
import { PushInboxEventsService } from './push-inbox.events';

@Module({
  providers: [
    FcmPushService,
    DeviceTokenService,
    AudienceResolverService,
    PushInboxEventsService,
    PushCampaignDispatchService,
    PushCampaignScheduler,
  ],
  exports: [
    FcmPushService,
    DeviceTokenService,
    AudienceResolverService,
    PushInboxEventsService,
    PushCampaignDispatchService,
  ],
})
export class PushModule {}
