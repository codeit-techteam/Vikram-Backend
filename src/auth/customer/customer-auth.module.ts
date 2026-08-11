import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { JwtAuthModule } from '../jwt/jwt-auth.module';
import { OtpModule } from '../otp/otp.module';
import { LoyaltyModule } from '../../modules/loyalty/loyalty.module';
import { DeliveryModule } from '../../modules/delivery/delivery.module';
import { NotificationModule } from '../../modules/notification/notification.module';

@Module({
  imports: [
    OtpModule,
    JwtAuthModule,
    LoyaltyModule,
    DeliveryModule,
    NotificationModule,
  ],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
