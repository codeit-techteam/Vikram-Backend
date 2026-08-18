import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { ServiceabilityController } from './serviceability.controller';
import { ServiceabilityService } from './serviceability.service';

@Module({
  imports: [CoverageModule],
  controllers: [ServiceabilityController],
  providers: [ServiceabilityService],
  exports: [ServiceabilityService],
})
export class ServiceabilityModule {}
