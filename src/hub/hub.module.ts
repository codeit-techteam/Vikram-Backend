import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

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

// Search
import { HubSearchController } from './search/hub-search.controller';
import { HubSearchService } from './search/hub-search.service';

@Module({
  imports: [
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
    HubDriversController,
    HubVehiclesController,
    HubEmergencyController,
    HubBulkController,
    HubNotificationsController,
    HubReportsController,
    HubSearchController,
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
