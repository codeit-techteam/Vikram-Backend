import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminBulkService } from './admin-bulk.service';
import { BulkQueryDto, UpdateBulkStatusDto, AssignExecutiveDto } from './dto/admin-bulk.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Bulk Procurement')
@Controller({ version: '1', path: 'admin/bulk' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminBulkController {
  constructor(
    private readonly bulkService: AdminBulkService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'List bulk procurement enquiries' })
  async findAll(@Query() query: BulkQueryDto) {
    const data = await this.bulkService.findAll(query);
    return { success: true, message: 'Bulk enquiries fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Get bulk enquiry details' })
  async findOne(@Param('id') id: string) {
    const data = await this.bulkService.findOne(id);
    return { success: true, message: 'Bulk enquiry fetched', data };
  }

  @Patch(':id/assign')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Assign executive to bulk enquiry' })
  async assign(@Param('id') id: string, @Body() dto: AssignExecutiveDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bulkService.assignExecutive(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'ASSIGN', resource: 'BulkEnquiry', resourceId: id, newValue: dto });
    return { success: true, message: 'Executive assigned', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update bulk enquiry status' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateBulkStatusDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bulkService.updateStatus(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'BulkEnquiry', resourceId: id, newValue: dto });
    return { success: true, message: 'Status updated', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Approve bulk enquiry' })
  async approve(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bulkService.approve(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'APPROVE', resource: 'BulkEnquiry', resourceId: id });
    return { success: true, message: 'Enquiry approved', data };
  }

  @Patch(':id/reject')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Reject bulk enquiry' })
  async reject(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin, @Body('remarks') remarks?: string) {
    const data = await this.bulkService.reject(id, remarks);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'REJECT', resource: 'BulkEnquiry', resourceId: id });
    return { success: true, message: 'Enquiry rejected', data };
  }

  @Patch(':id/quotation')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Send quotation for bulk enquiry' })
  async quotation(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin, @Body('remarks') remarks?: string) {
    const data = await this.bulkService.sendQuotation(id, remarks);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'BulkEnquiry', resourceId: id });
    return { success: true, message: 'Quotation sent', data };
  }

  @Patch(':id/complete')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Mark bulk enquiry as complete' })
  async complete(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.bulkService.complete(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'BulkEnquiry', resourceId: id });
    return { success: true, message: 'Enquiry completed', data };
  }
}
