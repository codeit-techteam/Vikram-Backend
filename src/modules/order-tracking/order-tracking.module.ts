import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrderTrackingController } from './order-tracking.controller';
import { OrderTrackingService } from './order-tracking.service';

@Module({
  imports: [OrdersModule],
  controllers: [OrderTrackingController],
  providers: [OrderTrackingService],
  exports: [OrderTrackingService],
})
export class OrderTrackingModule {}
