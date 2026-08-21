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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { DriversService } from '../../modules/drivers/drivers.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminDriverCreateDto,
  AdminDriversQueryDto,
  AdminDriverUpdateDto,
  AdminDriverVehicleDto,
  DriverDocumentConfirmDto,
  DriverDocumentUploadUrlDto,
} from './dto/admin-drivers.dto';

@ApiTags('Admin Drivers')
@Controller({ version: '1', path: 'admin/drivers' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminDriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly audit: AuditService,
  ) {}

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Driver fleet stats' })
  async stats(
    @Query('hubId') hubId?: string,
    @Query('warehouseHubId') warehouseHubId?: string,
  ) {
    const data = await this.driversService.getStats({ hubId, warehouseHubId });
    return { success: true, message: 'Driver stats', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all drivers (Driver Master)' })
  async findAll(@Query() query: AdminDriversQueryDto) {
    const data = await this.driversService.findAll(query);
    return { success: true, message: 'Drivers fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get driver detail' })
  async findOne(@Param('id') id: string) {
    const data = await this.driversService.findById(id);
    return { success: true, message: 'Driver fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create driver in Driver Master' })
  async create(
    @Body() dto: AdminDriverCreateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.create({
      ...dto,
      createdBy: admin.email ?? admin.id,
    });
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'driver',
      resourceId: data.id,
      newValue: {
        name: data.name,
        employeeId: data.employeeId,
        hubId: data.hubId,
      },
    });
    return { success: true, message: 'Driver created', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update driver' })
  async update(
    @Param('id') id: string,
    @Body() dto: AdminDriverUpdateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.update(
      id,
      { ...dto, updatedBy: admin.email ?? admin.id },
      { allowHubChange: true },
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'driver',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Driver updated', data };
  }

  @Patch(':id/vehicle')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Assign or unassign primary vehicle' })
  async assignVehicle(
    @Param('id') id: string,
    @Body() dto: AdminDriverVehicleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.assignVehicle(
      id,
      dto.vehicleId,
      admin.email ?? admin.id,
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'driver',
      resourceId: id,
      newValue: { type: 'vehicle_assignment', vehicleId: dto.vehicleId },
    });
    return {
      success: true,
      message: 'Driver vehicle assignment updated',
      data,
    };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Soft-delete / deactivate driver' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.softDelete(id, {
      actor: admin.email ?? admin.id,
    });
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'driver',
      resourceId: id,
    });
    return { success: true, message: 'Driver deactivated', data };
  }

  @Post(':id/documents/upload-url')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get signed R2 upload URL for driver document' })
  async uploadUrl(
    @Param('id') id: string,
    @Body() dto: DriverDocumentUploadUrlDto,
  ) {
    const data = await this.driversService.createDocumentUploadUrl(id, dto);
    return { success: true, message: 'Upload URL generated', data };
  }

  @Post(':id/documents')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Confirm driver document upload' })
  async confirmDocument(
    @Param('id') id: string,
    @Body() dto: DriverDocumentConfirmDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.confirmDocument(
      id,
      dto,
      admin.email ?? admin.id,
    );
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'driver_document',
      resourceId: data.id,
      newValue: { driverId: id, documentType: dto.documentType },
    });
    return { success: true, message: 'Document confirmed', data };
  }

  @Get(':id/documents')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List driver documents' })
  async listDocuments(@Param('id') id: string) {
    const data = await this.driversService.listDocuments(id);
    return { success: true, message: 'Documents fetched', data };
  }

  @Delete(':id/documents/:documentId')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete driver document' })
  async deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.driversService.deleteDocument(id, documentId);
    await this.audit.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'driver_document',
      resourceId: documentId,
      newValue: { driverId: id },
    });
    return { success: true, message: 'Document deleted', data };
  }
}
