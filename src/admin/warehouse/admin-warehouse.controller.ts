import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AdminWarehouseService } from './admin-warehouse.service';

class WarehouseInventoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
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
  limit?: number = 50;
}

class WarehouseTransferQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ description: 'Filter by destination hub UUID' })
  @IsOptional()
  @IsString()
  destinationHubId?: string;
  @ApiPropertyOptional({ description: 'Alias for destinationHubId' })
  @IsOptional()
  @IsString()
  hubId?: string;
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
  limit?: number = 50;
}

class AdjustWarehouseInventoryDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  availableQty?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reservedQty?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumStock?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
}

@ApiTags('Admin Warehouse')
@Controller({ version: '1', path: 'admin/warehouse' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminWarehouseController {
  constructor(
    private readonly warehouseService: AdminWarehouseService,
    private readonly auditService: AuditService,
  ) {}

  @Get('dashboard')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Central warehouse operational dashboard' })
  async dashboard() {
    const data = await this.warehouseService.getDashboard();
    return { success: true, message: 'Warehouse dashboard fetched', data };
  }

  @Get('inventory')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List central warehouse inventory' })
  async inventory(@Query() query: WarehouseInventoryQueryDto) {
    const data = await this.warehouseService.listInventory({
      ...query,
      status: query.status as
        'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'all' | undefined,
    });
    return { success: true, message: 'Warehouse inventory fetched', data };
  }

  @Get('inventory/export')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export central warehouse inventory CSV' })
  async exportInventory(@Query() query: WarehouseInventoryQueryDto) {
    const csv = await this.warehouseService.exportInventoryCsv({
      ...query,
      status: query.status as
        'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'all' | undefined,
    });
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv',
      disposition: `attachment; filename="warehouse-inventory-${Date.now()}.csv"`,
    });
  }

  @Patch('inventory')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Adjust central warehouse inventory for a product' })
  async adjustInventory(
    @Body() dto: AdjustWarehouseInventoryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.warehouseService.adjustInventory({
      ...dto,
      actorName: admin.email,
    });
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'WarehouseInventory',
      resourceId: dto.productId,
      newValue: dto,
    });
    return { success: true, message: 'Inventory updated', data };
  }

  @Get('allocations')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'List approved/allocated requisitions for Allocation Center',
  })
  async allocations(@Query() query: WarehouseTransferQueryDto) {
    const data = await this.warehouseService.listAllocations(query);
    return { success: true, message: 'Allocations fetched', data };
  }

  @Get('transfers')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({
    summary: 'List warehouse→hub transfers (allocated/dispatched requisitions)',
  })
  async transfers(@Query() query: WarehouseTransferQueryDto) {
    const data = await this.warehouseService.listTransfers(query);
    return { success: true, message: 'Transfers fetched', data };
  }

  @Get('transfers/:id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Transfer detail with full lifecycle timeline' })
  async transferDetail(@Param('id') id: string) {
    const data = await this.warehouseService.getTransfer(id);
    return { success: true, message: 'Transfer detail fetched', data };
  }
}
