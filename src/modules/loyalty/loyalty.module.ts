import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyController } from './loyalty.controller';
import { CustomerLoyaltyController } from './customer-loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyTransactionService } from './loyalty-transaction.service';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [ConfigModule, forwardRef(() => DeliveryModule)],
  controllers: [LoyaltyController, CustomerLoyaltyController],
  providers: [LoyaltyService, LoyaltyTransactionService, InternalApiGuard],
  exports: [LoyaltyService, LoyaltyTransactionService],
})
export class LoyaltyModule {}
