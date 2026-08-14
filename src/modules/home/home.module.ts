import { Module } from '@nestjs/common';
import { BannerModule } from '../banner/banner.module';
import { CategoryModule } from '../category/category.module';
import { OfferModule } from '../offer/offer.module';
import { ProductModule } from '../product/product.module';
import { VideoModule } from '../video/video.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { OrdersModule } from '../orders/orders.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [
    BannerModule,
    OfferModule,
    CategoryModule,
    ProductModule,
    VideoModule,
    LoyaltyModule,
    TestimonialsModule,
    OrdersModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
