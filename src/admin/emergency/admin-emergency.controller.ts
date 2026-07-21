import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminEmergencyService } from './admin-emergency.service';
import { EmergencyQueryDto, AssignHubDto } from './dto/admin-emergency.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Emergency Orders')
@Controller({ version: '1', path: 'admin/emergency-orders' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminEmergencyController {
  constructor(
    private readonly emergencyService: AdminEmergencyService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List emergency orders sorted by priority' })
  async findAll(@Query() query: EmergencyQueryDto) {
    const data = await this.emergencyService.findAll(query);
    return { success: true, message: 'Emergency orders fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get emergency order details' })
  async findOne(@Param('id') id: string) {
    const data = await this.emergencyService.findOne(id);
    return { success: true, message: 'Emergency order fetched', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Approve emergency order' })
  async approve(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.emergencyService.approve(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'APPROVE', resource: 'EmergencyOrder', resourceId: id });
    return { success: true, message: 'Emergency order approved', data };
  }

  @Patch(':id/reject')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reject emergency order' })
  async reject(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.emergencyService.reject(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'REJECT', resource: 'EmergencyOrder', resourceId: id });
    return { success: true, message: 'Emergency order rejected', data };
  }

  @Patch(':id/assign-hub')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Assign hub to emergency order' })
  async assignHub(@Param('id') id: string, @Body() dto: AssignHubDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.emergencyService.assignHub(id, dto.hubId);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'ASSIGN', resource: 'EmergencyOrder', resourceId: id, newValue: dto });
    return { success: true, message: 'Hub assigned', data };
  }

  @Patch(':id/delivered')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Mark emergency order as delivered' })
  async markDelivered(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.emergencyService.markDelivered(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'EmergencyOrder', resourceId: id });
    return { success: true, message: 'Emergency order marked as delivered', data };
  }
}
