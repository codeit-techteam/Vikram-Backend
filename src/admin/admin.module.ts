import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Auth
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminSessionService } from './auth/admin-session.service';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';

// Guards
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

// Audit
import { AuditService } from './audit/audit.service';
import { AdminAuditController } from './audit/admin-audit.controller';

// Dashboard
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';

// Customers
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCustomersService } from './customers/admin-customers.service';
import { CustomerSitesModule } from '../modules/customer-sites/customer-sites.module';

// Customer Executive
import { CustomerExecutiveController } from './customer-executive/customer-executive.controller';
import { CustomerExecutiveService } from './customer-executive/customer-executive.service';
import { PaymentWebhookController } from './payments/payment-webhook.controller';

// Hub Managers
import { AdminHubManagersController } from './hub-managers/admin-hub-managers.controller';
import { AdminHubManagersService } from './hub-managers/admin-hub-managers.service';

// Admin Users
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

// Hubs
import { AdminHubsController } from './hubs/admin-hubs.controller';
import { AdminHubsService } from './hubs/admin-hubs.service';
import { AdminHubOrdersService } from './hubs/admin-hub-orders.service';

// Membership
import { AdminMembershipController } from './membership/admin-membership.controller';
import { AdminMembershipService } from './membership/admin-membership.service';

// Loyalty
import { AdminLoyaltyController } from './loyalty/admin-loyalty.controller';
import { AdminLoyaltyService } from './loyalty/admin-loyalty.service';

// Products
import { AdminProductsController } from './products/admin-products.controller';
import { AdminProductsService } from './products/admin-products.service';

// Categories
import { AdminCategoriesController } from './categories/admin-categories.controller';
import { AdminCategoriesService } from './categories/admin-categories.service';

// Banners
import { AdminBannersController } from './banners/admin-banners.controller';
import { AdminBannersService } from './banners/admin-banners.service';

// Advertisements
import { AdminAdvertisementsController } from './advertisements/admin-advertisements.controller';
import { AdminAdvertisementsService } from './advertisements/admin-advertisements.service';

// Promotional Cards
import { AdminPromotionalCardsController } from './promotional-cards/admin-promotional-cards.controller';
import { AdminPromotionalCardsService } from './promotional-cards/admin-promotional-cards.service';

// Home Sections
import { AdminHomeSectionsController } from './home-sections/admin-home-sections.controller';
import { AdminHomeSectionsService } from './home-sections/admin-home-sections.service';

// Quick Actions
import { AdminQuickActionsController } from './quick-actions/admin-quick-actions.controller';
import { AdminQuickActionsService } from './quick-actions/admin-quick-actions.service';

// Videos
import { AdminVideosController } from './videos/admin-videos.controller';
import { AdminVideosService } from './videos/admin-videos.service';

// Media (R2 uploads)
import { AdminMediaController } from './media/admin-media.controller';
import { AdminUploadAliasController } from './media/admin-upload-alias.controller';

// Testimonials
import { AdminTestimonialsController } from './testimonials/admin-testimonials.controller';
import { AdminTestimonialsService } from './testimonials/admin-testimonials.service';

// Bulk Procurement
import { AdminBulkController } from './bulk/admin-bulk.controller';
import { AdminBulkService } from './bulk/admin-bulk.service';

// Emergency Orders
import { AdminEmergencyController } from './emergency/admin-emergency.controller';
import { AdminEmergencyService } from './emergency/admin-emergency.service';

// Orders
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';

// Notifications
import { AdminNotificationsController } from './notifications/admin-notifications.controller';
import { AdminNotificationsService } from './notifications/admin-notifications.service';

// Offers
import { AdminOffersController } from './offers/admin-offers.controller';
import { AdminOffersService } from './offers/admin-offers.service';

// CMS
import { AdminCmsController } from './cms/admin-cms.controller';
import { AdminCmsService } from './cms/admin-cms.service';

// Search
import { AdminSearchController } from './search/admin-search.controller';
import { AdminSearchService } from './search/admin-search.service';

// Reports
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';

// Finance
import { AdminFinanceController } from './finance/admin-finance.controller';
import { AdminFinanceService } from './finance/admin-finance.service';
import { AdminInvoicesController } from './invoices/admin-invoices.controller';

// Support
import { AdminSupportController } from './support/admin-support.controller';
import { AdminSupportService } from './support/admin-support.service';

// Requisitions
import { AdminRequisitionsController } from './requisitions/admin-requisitions.controller';
import { WarehouseRequisitionsController } from './requisitions/warehouse-requisitions.controller';
import { AdminHubReceivingController } from './hub-receiving/admin-hub-receiving.controller';
import { RequisitionTrackingController } from '../modules/requisitions/requisition-tracking.controller';
import { RequisitionsModule } from '../modules/requisitions/requisitions.module';
import { AdminWarehouseController } from './warehouse/admin-warehouse.controller';
import { AdminWarehouseService } from './warehouse/admin-warehouse.service';
import { VehiclesModule } from '../modules/vehicles/vehicles.module';
import { AdminVehiclesController } from './vehicles/admin-vehicles.controller';
import { DriversModule } from '../modules/drivers/drivers.module';
import { AdminDriversController } from './drivers/admin-drivers.controller';
import { AdminLogisticsController } from './logistics/admin-logistics.controller';
import { AdminLogisticsService } from './logistics/admin-logistics.service';
import { AdminDeliveryPricingController } from './delivery-pricing/admin-delivery-pricing.controller';

// Shared modules
import { RedisModule } from '../common/database/redis.module';
import { OtpModule } from '../auth/otp/otp.module';
import { CartModule } from '../modules/cart/cart.module';
import { OrdersModule } from '../modules/orders/orders.module';
import { NotificationModule } from '../modules/notification/notification.module';
import { SupportModule } from '../modules/support/support.module';
import { InvoiceModule } from '../modules/invoice/invoice.module';
import { HubModule } from '../hub/hub.module';
import { LoyaltyModule } from '../modules/loyalty/loyalty.module';
import { DeliveryModule } from '../modules/delivery/delivery.module';

@Module({
  imports: [
    PassportModule,
    RedisModule,
    OtpModule,
    CartModule,
    OrdersModule,
    NotificationModule,
    SupportModule,
    InvoiceModule,
    HubModule,
    LoyaltyModule,
    DeliveryModule,
    RequisitionsModule,
    VehiclesModule,
    DriversModule,
    CustomerSitesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminAuditController,
    AdminDashboardController,
    AdminCustomersController,
    CustomerExecutiveController,
    PaymentWebhookController,
    AdminHubManagersController,
    AdminUsersController,
    AdminHubsController,
    AdminMembershipController,
    AdminLoyaltyController,
    AdminProductsController,
    AdminCategoriesController,
    AdminBannersController,
    AdminAdvertisementsController,
    AdminPromotionalCardsController,
    AdminHomeSectionsController,
    AdminQuickActionsController,
    AdminVideosController,
    AdminMediaController,
    AdminUploadAliasController,
    AdminTestimonialsController,
    AdminBulkController,
    AdminEmergencyController,
    AdminOrdersController,
    AdminNotificationsController,
    AdminOffersController,
    AdminCmsController,
    AdminSearchController,
    AdminReportsController,
    AdminFinanceController,
    AdminInvoicesController,
    AdminSupportController,
    AdminRequisitionsController,
    WarehouseRequisitionsController,
    AdminHubReceivingController,
    AdminWarehouseController,
    RequisitionTrackingController,
    AdminVehiclesController,
    AdminDriversController,
    AdminLogisticsController,
    AdminDeliveryPricingController,
  ],
  providers: [
    AdminJwtStrategy,
    AdminJwtAuthGuard,
    AdminRolesGuard,
    AdminAuthService,
    AdminSessionService,
    AuditService,
    AdminDashboardService,
    AdminCustomersService,
    CustomerExecutiveService,
    AdminHubManagersService,
    AdminUsersService,
    AdminHubsService,
    AdminHubOrdersService,
    AdminMembershipService,
    AdminLoyaltyService,
    AdminProductsService,
    AdminCategoriesService,
    AdminBannersService,
    AdminAdvertisementsService,
    AdminPromotionalCardsService,
    AdminHomeSectionsService,
    AdminQuickActionsService,
    AdminVideosService,
    AdminTestimonialsService,
    AdminBulkService,
    AdminEmergencyService,
    AdminOrdersService,
    AdminNotificationsService,
    AdminOffersService,
    AdminCmsService,
    AdminSearchService,
    AdminReportsService,
    AdminFinanceService,
    AdminSupportService,
    AdminWarehouseService,
    AdminLogisticsService,
  ],
  exports: [AuditService],
})
export class AdminModule {}
