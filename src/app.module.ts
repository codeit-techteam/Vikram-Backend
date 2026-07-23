import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './common/config/configuration';
import { validate } from './common/config/env.validation';
import { EmailModule } from './common/email/email.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/database/redis.module';
import { CacheModule } from './common/cache/cache.module';
import { HealthModule } from './common/health/health.module';
import { QueueModule } from './common/queue/queue.module';
import { BannerModule } from './modules/banner/banner.module';
import { CategoryModule } from './modules/category/category.module';
import { CmsModule } from './modules/cms/cms.module';
import { HomeModule } from './modules/home/home.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OfferModule } from './modules/offer/offer.module';
import { ProductModule } from './modules/product/product.module';
import { SearchModule } from './modules/search/search.module';
import { VideoModule } from './modules/video/video.module';
import { AuthModule } from './auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OrderTrackingModule } from './modules/order-tracking/order-tracking.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SupportModule } from './modules/support/support.module';
import { CustomerProfileModule } from './modules/customer-profile/customer-profile.module';
import { MembershipModule } from './modules/membership/membership.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { BulkModule } from './modules/bulk/bulk.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { EmergencyOrderModule } from './modules/emergency-order/emergency-order.module';
import { AdminModule } from './admin/admin.module';
import { HubModule } from './hub/hub.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: ['.env.development', '.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level:
            configService.get<string>('app.env') === 'production'
              ? 'info'
              : 'debug',
          transport:
            configService.get<string>('app.env') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    DatabaseModule,
    EmailModule,
    RedisModule,
    CacheModule,
    QueueModule,
    HealthModule,
    CategoryModule,
    ProductModule,
    BannerModule,
    OfferModule,
    VideoModule,
    CmsModule,
    HomeModule,
    SearchModule,
    NotificationModule,
    AuthModule,
    CustomerModule,
    CustomerProfileModule,
    WishlistModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    OrderTrackingModule,
    InvoiceModule,
    ReviewsModule,
    SupportModule,
    MembershipModule,
    LoyaltyModule,
    BulkModule,
    TestimonialsModule,
    EmergencyOrderModule,
    AdminModule,
    HubModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
