import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
