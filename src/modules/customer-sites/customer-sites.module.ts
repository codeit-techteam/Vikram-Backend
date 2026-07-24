import { Module } from '@nestjs/common';
import { CustomerSitesController } from './customer-sites.controller';
import { CustomerSitesService } from './customer-sites.service';

@Module({
  controllers: [CustomerSitesController],
  providers: [CustomerSitesService],
  exports: [CustomerSitesService],
})
export class CustomerSitesModule {}
