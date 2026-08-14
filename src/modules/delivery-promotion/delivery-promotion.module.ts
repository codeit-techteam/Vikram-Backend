import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryPromotionController } from './delivery-promotion.controller';
import { DeliveryPromotionService } from './delivery-promotion.service';

@Module({
  imports: [DeliveryModule],
  controllers: [DeliveryPromotionController],
  providers: [DeliveryPromotionService],
  exports: [DeliveryPromotionService],
})
export class DeliveryPromotionModule {}
