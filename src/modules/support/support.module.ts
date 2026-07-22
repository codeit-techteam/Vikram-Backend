import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { SupportController } from './support.controller';
import { SupportMessageService } from './support-message.service';
import { SupportService } from './support.service';

@Module({
  imports: [NotificationModule],
  controllers: [SupportController],
  providers: [SupportService, SupportMessageService],
  exports: [SupportService, SupportMessageService],
})
export class SupportModule {}
