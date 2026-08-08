import { Module } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
