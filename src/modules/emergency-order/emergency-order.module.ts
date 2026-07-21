import { Module } from '@nestjs/common';
import { EmergencyOrderController } from './emergency-order.controller';
import { EmergencyOrderService } from './emergency-order.service';

@Module({
  controllers: [EmergencyOrderController],
  providers: [EmergencyOrderService],
  exports: [EmergencyOrderService],
})
export class EmergencyOrderModule {}
