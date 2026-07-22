import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { NotificationModule } from '../notification/notification.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CheckoutModule, NotificationModule, LoyaltyModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
