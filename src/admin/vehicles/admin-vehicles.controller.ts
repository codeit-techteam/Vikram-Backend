import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { VehiclesService } from '../../modules/vehicles/vehicles.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminVehicleAssignmentDto,
  AdminVehicleCreateDto,
  AdminVehicleDriverDto,
  AdminVehicleStatusDto,
  AdminVehiclesQueryDto,
  AdminVehicleUpdateDto,
  VehicleDocumentConfirmDto,
  VehicleDocumentUploadUrlDto,
} from './dto/admin-vehicles.dto';
import type { VehicleStatus } from '../../../generated/prisma/client';

@ApiTags('Admin Vehicles')
@Controller({ version: '1', path: 'admin/vehicles' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminVehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly audit: AuditService,
  ) {}

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Fleet stats (total/running/available/maintenance/inactive)' })
  async stats(
    @Query('hubId') hubId?: string,
    @Query('warehouseHubId') warehouseHubId?: string,
  ) {
    const data = await this.vehiclesService.getStats({ hubId, warehouseHubId });
    return { success: true, message: 'Fleet stats', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all vehicles (Vehicle Master)' })
  async findAll(@Query() query: AdminVehiclesQueryDto) {
    const data = await this.vehiclesService.findAll(query);
    return { success: true, message: 'Vehicles fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get vehicle detail' })
  async findOne(@Param('id') id: string) {
    const data = await this.vehiclesService.findById(id);
    return { success: true, message: 'Vehicle fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create vehicle in Vehicle Master' })
  async create(
    @Body() dto: AdminVehicleCreateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.create({
      ...dto,
      status: dto.status as VehicleStatus | undefined,
      createdBy: admin.email ?? admin.id,
    });
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'vehicle',
      resourceId: data.id,
      newValue: { registration: data.registration, hubId: data.hubId },
    });
    return { success: true, message: 'Vehicle created', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update vehicle' })
  async update(
    @Param('id') id: string,
    @Body() dto: AdminVehicleUpdateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.update(
      id,
      {
        ...dto,
        status: dto.status as VehicleStatus | undefined,
        updatedBy: admin.email ?? admin.id,
      },
      { allowHubChange: true },
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'vehicle',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Vehicle updated', data };
  }

  @Patch(':id/assignment')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Assign vehicle to warehouse/hub/driver' })
  async assignment(
    @Param('id') id: string,
    @Body() dto: AdminVehicleAssignmentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.updateAssignment(
      id,
      dto,
      admin.email ?? admin.id,
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'vehicle',
      resourceId: id,
      newValue: { type: 'assignment', ...dto },
    });
    return { success: true, message: 'Vehicle assignment updated', data };
  }

  @Patch(':id/driver')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Assign or unassign driver' })
  async driver(
    @Param('id') id: string,
    @Body() dto: AdminVehicleDriverDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.update(
      id,
      {
        assignedDriverId: dto.assignedDriverId,
        updatedBy: admin.email ?? admin.id,
      },
      { allowHubChange: true },
    );
    return { success: true, message: 'Driver assignment updated', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Change vehicle status (maintenance/inactive/etc.)' })
  async status(
    @Param('id') id: string,
    @Body() dto: AdminVehicleStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.updateStatus(
      id,
      dto.status as VehicleStatus,
      admin.email ?? admin.id,
      dto.reason,
      {
        maintenanceReason: dto.maintenanceReason,
        maintenanceExpectedAt: dto.maintenanceExpectedAt,
      },
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'vehicle',
      resourceId: id,
      newValue: { type: 'status', status: dto.status },
    });
    return { success: true, message: 'Vehicle status updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Soft-delete / deactivate vehicle' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.softDelete(id, {
      actor: admin.email ?? admin.id,
    });
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'vehicle',
      resourceId: id,
    });
    return { success: true, message: 'Vehicle deactivated', data };
  }

  @Get(':id/dispatch-history')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async dispatchHistory(@Param('id') id: string) {
    const data = await this.vehiclesService.getDispatchHistory(id);
    return { success: true, message: 'Dispatch history', data };
  }

  @Get(':id/documents')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  async listDocuments(@Param('id') id: string) {
    const data = await this.vehiclesService.listDocuments(id);
    return { success: true, message: 'Documents fetched', data };
  }

  @Post(':id/documents/upload-url')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async uploadUrl(
    @Param('id') id: string,
    @Body() dto: VehicleDocumentUploadUrlDto,
  ) {
    const data = await this.vehiclesService.createDocumentUploadUrl(id, dto);
    return { success: true, message: 'Upload URL created', data };
  }

  @Post(':id/documents')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async confirmDocument(
    @Param('id') id: string,
    @Body() dto: VehicleDocumentConfirmDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.vehiclesService.confirmDocument(
      id,
      dto,
      admin.email ?? admin.id,
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'vehicle_document',
      resourceId: data.id,
      newValue: { vehicleId: id, documentType: dto.documentType },
    });
    return { success: true, message: 'Document saved', data };
  }

  @Delete(':id/documents/:documentId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.vehiclesService.deleteDocument(id, documentId);
    return { success: true, message: 'Document deleted', data };
  }
}
