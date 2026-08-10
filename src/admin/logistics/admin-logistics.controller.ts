import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminLogisticsService } from './admin-logistics.service';

class LogisticsListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

class WarehouseLogisticsQueryDto extends LogisticsListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hubId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() destinationHubId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
}

class CustomerLogisticsQueryDto extends LogisticsListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() hubId?: string;
}

class DispatchLogisticsQueryDto extends LogisticsListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignment?: string;
}

@ApiTags('Admin Logistics')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller({ path: 'admin/logistics', version: '1' })
export class AdminLogisticsController {
  constructor(private readonly logisticsService: AdminLogisticsService) {}

  @Get('filters')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Warehouses + hubs for logistics filter dropdowns' })
  async filters() {
    const data = await this.logisticsService.getFilters();
    return { success: true, message: 'Logistics filters', data };
  }

  @Get('dashboard')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Logistics control-tower dashboard aggregates' })
  async dashboard() {
    const data = await this.logisticsService.getDashboard();
    return { success: true, message: 'Logistics dashboard', data };
  }

  @Get('warehouse')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Warehouse → hub transfers for logistics UI' })
  async warehouse(@Query() query: WarehouseLogisticsQueryDto) {
    const data = await this.logisticsService.listWarehouse(query);
    return { success: true, message: 'Warehouse logistics', data };
  }

  @Get('customer')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Hub → customer deliveries for logistics UI' })
  async customer(@Query() query: CustomerLogisticsQueryDto) {
    const data = await this.logisticsService.listCustomer(query);
    return { success: true, message: 'Customer logistics', data };
  }

  @Get('dispatch')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Route & dispatch board (warehouse + customer)' })
  async dispatch(@Query() query: DispatchLogisticsQueryDto) {
    const data = await this.logisticsService.listDispatch(query);
    return { success: true, message: 'Dispatch board', data };
  }

  @Get('maintenance')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Vehicle maintenance board from vehicle records' })
  async maintenance(@Query() query: LogisticsListQueryDto) {
    const data = await this.logisticsService.listMaintenance(query);
    return { success: true, message: 'Maintenance board', data };
  }

  @Get('tracking/:shipmentId')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'Track warehouse transfer or customer delivery by shipment ID',
  })
  async tracking(@Param('shipmentId') shipmentId: string) {
    const data = await this.logisticsService.trackShipment(shipmentId);
    return { success: true, message: 'Shipment tracking', data };
  }
}
