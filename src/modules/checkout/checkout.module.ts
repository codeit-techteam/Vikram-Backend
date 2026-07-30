import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { MembershipModule } from '../membership/membership.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CoverageModule } from '../coverage/coverage.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [CartModule, MembershipModule, LoyaltyModule, CoverageModule, DeliveryModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
