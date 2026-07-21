import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { MembershipModule } from '../membership/membership.module';
import { WalletModule } from '../wallet/wallet.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [CartModule, MembershipModule, WalletModule, LoyaltyModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
