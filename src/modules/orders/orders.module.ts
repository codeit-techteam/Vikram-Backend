import { Global, Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { NotificationModule } from '../notification/notification.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEventsService } from './order-events.service';

@Global()
@Module({
  imports: [CheckoutModule, NotificationModule, LoyaltyModule, DeliveryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsService],
  exports: [OrdersService, OrderEventsService],
})
export class OrdersModule {}
