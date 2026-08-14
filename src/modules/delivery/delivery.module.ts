import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryBenefitService } from './delivery-benefit.service';
import { DeliveryPricingController } from './delivery-pricing.controller';
import { DeliveryPricingService } from './delivery-pricing.service';
import { DeliveryEtaEngineService } from './engine/delivery-eta-engine.service';
import { DeliveryLoadService } from './engine/delivery-load.service';
import { DeliveryVehicleSelectionService } from './engine/delivery-vehicle-selection.service';

@Module({
  imports: [CoverageModule],
  controllers: [DeliveryController, DeliveryPricingController],
  providers: [
    DeliveryService,
    DeliveryBenefitService,
    DeliveryPricingService,
    DeliveryLoadService,
    DeliveryVehicleSelectionService,
    DeliveryEtaEngineService,
  ],
  exports: [
    DeliveryService,
    DeliveryBenefitService,
    DeliveryPricingService,
    DeliveryLoadService,
    DeliveryVehicleSelectionService,
    DeliveryEtaEngineService,
  ],
})
export class DeliveryModule {}
