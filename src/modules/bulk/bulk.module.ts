import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';

@Module({
  imports: [NotificationModule],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
