import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [CoverageModule, DeliveryModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
