import { Module } from '@nestjs/common';
import { ExpertCallbackController } from './expert-callback.controller';
import { ExpertCallbackService } from './expert-callback.service';

@Module({
  controllers: [ExpertCallbackController],
  providers: [ExpertCallbackService],
  exports: [ExpertCallbackService],
})
export class ExpertCallbackModule {}
