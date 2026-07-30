import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { CatalogSeederService } from './catalog-seeder.service';

@Module({
  imports: [ProductModule],
  controllers: [CategoryController],
  providers: [CategoryService, CatalogSeederService],
  exports: [CategoryService, CatalogSeederService],
})
export class CategoryModule {}
