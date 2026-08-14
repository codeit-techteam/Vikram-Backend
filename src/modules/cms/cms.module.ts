import { Module } from '@nestjs/common';
import { DeliveryPromotionModule } from '../delivery-promotion/delivery-promotion.module';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({
  imports: [DeliveryPromotionModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
