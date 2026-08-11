import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoyaltyModule } from '../modules/loyalty/loyalty.module';
import { DeliveryModule } from '../modules/delivery/delivery.module';
import { InvoiceModule } from '../modules/invoice/invoice.module';

// Auth
import { HubAuthController } from './auth/hub-auth.controller';
import { HubAuthService } from './auth/hub-auth.service';
import { HubJwtStrategy } from './auth/hub-jwt.strategy';

// Guards
import { HubJwtAuthGuard } from './guards/hub-jwt-auth.guard';
import { HubRolesGuard } from './guards/hub-roles.guard';

// Repositories
import { HubOrderRepository } from './repositories/hub-order.repository';
import { HubInventoryRepository } from './repositories/hub-inventory.repository';

// Dashboard
import { HubDashboardController } from './dashboard/hub-dashboard.controller';
import { HubDashboardService } from './dashboard/hub-dashboard.service';

// Profile
import { HubProfileController } from './profile/hub-profile.controller';
import { HubProfileService } from './profile/hub-profile.service';

// Inventory
import { HubInventoryController } from './inventory/hub-inventory.controller';
import { HubInventoryService } from './inventory/hub-inventory.service';

// Products
import { HubProductsController } from './products/hub-products.controller';
import { HubProductsService } from './products/hub-products.service';

// Orders
import { HubOrdersController } from './orders/hub-orders.controller';
import { HubOrdersService } from './orders/hub-orders.service';

// Loading
import { HubLoadingController } from './loading/hub-loading.controller';
import { HubLoadingService } from './loading/hub-loading.service';

// Unloading
import { HubUnloadingController } from './unloading/hub-unloading.controller';
import { HubUnloadingService } from './unloading/hub-unloading.service';

// Dispatch
import { HubDispatchController } from './dispatch/hub-dispatch.controller';
import { HubDispatchService } from './dispatch/hub-dispatch.service';

// Fleet (available vehicles / stats)
import { HubFleetController } from './fleet/hub-fleet.controller';

// Drivers
import { HubDriversController } from './drivers/hub-drivers.controller';
import { HubDriversService } from './drivers/hub-drivers.service';

// Vehicles
import { HubVehiclesController } from './vehicles/hub-vehicles.controller';
import { HubVehiclesService } from './vehicles/hub-vehicles.service';

// Emergency
import { HubEmergencyController } from './emergency/hub-emergency.controller';
import { HubEmergencyService } from './emergency/hub-emergency.service';

// Bulk
import { HubBulkController } from './bulk/hub-bulk.controller';
import { HubBulkService } from './bulk/hub-bulk.service';

// Notifications
import { HubNotificationsController } from './notifications/hub-notifications.controller';
import { HubNotificationsService } from './notifications/hub-notifications.service';

// Reports
import { HubReportsController } from './reports/hub-reports.controller';
import { HubReportsService } from './reports/hub-reports.service';

// Requisitions
import { HubRequisitionsController } from './requisitions/hub-requisitions.controller';
import { HubMaterialsController } from './requisitions/hub-materials.controller';
import { HubTransfersController } from './transfers/hub-transfers.controller';
import { HubMediaController } from './media/hub-media.controller';
import { HubMaterialReceiptsController } from './material-receipts/hub-material-receipts.controller';
import { HubRequisitionTrackingController } from '../modules/requisitions/requisition-tracking.controller';

// Search
import { HubSearchController } from './search/hub-search.controller';
import { HubSearchService } from './search/hub-search.service';
import { HubDeliveryPricingController } from './delivery-pricing/hub-delivery-pricing.controller';
import { RequisitionsModule } from '../modules/requisitions/requisitions.module';
import { VehiclesModule } from '../modules/vehicles/vehicles.module';
import { DriversModule } from '../modules/drivers/drivers.module';

@Module({
  imports: [
    LoyaltyModule,
    DeliveryModule,
    InvoiceModule,
    RequisitionsModule,
    VehiclesModule,
    DriversModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  controllers: [
    HubAuthController,
    HubDashboardController,
    HubProfileController,
    HubInventoryController,
    HubProductsController,
    HubOrdersController,
    HubLoadingController,
    HubUnloadingController,
    HubDispatchController,
    HubFleetController,
    HubDriversController,
    HubVehiclesController,
    HubEmergencyController,
    HubBulkController,
    HubNotificationsController,
    HubReportsController,
    HubSearchController,
    HubRequisitionsController,
    HubMaterialsController,
    HubTransfersController,
    HubMediaController,
    HubMaterialReceiptsController,
    HubRequisitionTrackingController,
    HubDeliveryPricingController,
  ],
  providers: [
    HubJwtStrategy,
    HubJwtAuthGuard,
    HubRolesGuard,
    HubAuthService,
    HubOrderRepository,
    HubInventoryRepository,
    HubDashboardService,
    HubProfileService,
    HubInventoryService,
    HubProductsService,
    HubOrdersService,
    HubLoadingService,
    HubUnloadingService,
    HubDispatchService,
    HubDriversService,
    HubVehiclesService,
    HubEmergencyService,
    HubBulkService,
    HubNotificationsService,
    HubReportsService,
    HubSearchService,
  ],
  exports: [HubDashboardService, HubInventoryRepository],
})
export class HubModule {}
