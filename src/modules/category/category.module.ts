import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { CatalogSeederService } from './catalog-seeder.service';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, CatalogSeederService],
  exports: [CategoryService, CatalogSeederService],
})
export class CategoryModule {}
