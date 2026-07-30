import { Module } from '@nestjs/common';
import { CoverageModule } from '../coverage/coverage.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [CoverageModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
