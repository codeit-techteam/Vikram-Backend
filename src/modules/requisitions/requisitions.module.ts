import { Module } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';

@Module({
  providers: [RequisitionsService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
