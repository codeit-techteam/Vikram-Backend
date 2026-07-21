import { Module } from '@nestjs/common';
import { BannerModule } from '../banner/banner.module';
import { CategoryModule } from '../category/category.module';
import { OfferModule } from '../offer/offer.module';
import { ProductModule } from '../product/product.module';
import { VideoModule } from '../video/video.module';
import { MembershipModule } from '../membership/membership.module';
import { WalletModule } from '../wallet/wallet.module';
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
    MembershipModule,
    WalletModule,
    LoyaltyModule,
    TestimonialsModule,
    OrdersModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
