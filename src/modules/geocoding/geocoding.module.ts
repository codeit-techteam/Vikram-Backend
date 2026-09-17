import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingRateLimitGuard } from './geocoding-rate-limit.guard';
import { GeocodingService } from './geocoding.service';

@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService, GeocodingRateLimitGuard],
  exports: [GeocodingService],
})
export class GeocodingModule {}
