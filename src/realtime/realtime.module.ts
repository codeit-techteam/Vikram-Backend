import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt/jwt-auth.module';
import { NotificationModule } from '../modules/notification/notification.module';
import { OrdersModule } from '../modules/orders/orders.module';
import { FcmPushService } from './fcm-push.service';
import { OrderRealtimeService } from './order-realtime.service';
import { OrdersGateway } from './orders.gateway';

@Module({
  imports: [JwtAuthModule, OrdersModule, NotificationModule],
  providers: [OrdersGateway, OrderRealtimeService, FcmPushService],
  exports: [OrdersGateway, OrderRealtimeService],
})
export class RealtimeModule {}
