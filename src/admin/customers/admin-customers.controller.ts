import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerStatus } from '../../../generated/prisma/client';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminCustomersService } from './admin-customers.service';
import {
  AdminAssignCustomerDto,
  AdminCustomerQueryDto,
  AdminSetStatusDto,
  AdminUpdateCustomerDto,
  AdminUpgradeMembershipDto,
} from './dto/admin-customers.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { CustomerSitesService } from '../../modules/customer-sites/customer-sites.service';
import {
  CreateSiteDto,
  UpdateSiteDto,
} from '../../modules/customer-sites/dto/site.dto';

@ApiTags('Admin Customers')
@Controller({ version: '1', path: 'admin/customers' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminCustomersController {
  constructor(
    private readonly customersService: AdminCustomersService,
    private readonly sitesService: CustomerSitesService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'List all customers with filters and pagination' })
  async findAll(@Query() query: AdminCustomerQueryDto) {
    const data = await this.customersService.findAll(query);
    return { success: true, message: 'Customers fetched', data };
  }

  @Get('stats')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Customer dashboard statistics' })
  async stats() {
    const data = await this.customersService.getStats();
    return { success: true, message: 'Customer stats fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Get customer details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.customersService.findOne(id);
    return { success: true, message: 'Customer fetched', data };
  }

  @Get(':id/sites')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'List customer delivery sites' })
  async listSites(@Param('id') id: string) {
    const data = await this.sitesService.listForAdmin(id);
    return { success: true, message: 'Delivery sites fetched', data };
  }

  @Post(':id/sites')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Create customer delivery site' })
  async createSite(@Param('id') id: string, @Body() dto: CreateSiteDto) {
    const data = await this.sitesService.createForAdmin(id, dto);
    return { success: true, message: 'Delivery site created', data };
  }

  @Put(':id/sites/:siteId')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Update customer delivery site' })
  async updateSite(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
    @Body() dto: UpdateSiteDto,
  ) {
    const data = await this.sitesService.updateForAdmin(id, siteId, dto);
    return { success: true, message: 'Delivery site updated', data };
  }

  @Delete(':id/sites/:siteId')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Delete customer delivery site' })
  async deleteSite(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
  ) {
    await this.sitesService.removeForAdmin(id, siteId);
    return { success: true, message: 'Delivery site deleted', data: null };
  }

  @Patch(':id/sites/:siteId/primary')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Set customer primary delivery site' })
  async setPrimarySite(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
  ) {
    const data = await this.sitesService.setPrimaryForAdmin(id, siteId);
    return { success: true, message: 'Primary site updated', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update customer details' })
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const old = await this.customersService.findOne(id);
    const data = await this.customersService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'Customer',
      resourceId: id,
      oldValue: old,
      newValue: dto,
    });
    return { success: true, message: 'Customer updated', data };
  }

  @Patch(':id/assignment')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Assign hub and/or customer executive' })
  async assign(
    @Param('id') id: string,
    @Body() dto: AdminAssignCustomerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const old = await this.customersService.findOne(id);
    const data = await this.customersService.assign(id, dto, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerAssignment',
      resourceId: id,
      oldValue: {
        assignedHubId: old.assignedHubId,
        assignedExecutiveId: old.assignedExecutiveId,
      },
      newValue: dto,
    });
    return { success: true, message: 'Customer assignment updated', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Activate, disable, or suspend a customer' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: AdminSetStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.customersService.setStatus(id, dto.status);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerStatus',
      resourceId: id,
      newValue: { status: dto.status },
    });
    return { success: true, message: `Customer marked ${dto.status}`, data };
  }

  @Post(':id/membership/upgrade')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Upgrade customer membership plan' })
  async upgradeMembership(
    @Param('id') id: string,
    @Body() dto: AdminUpgradeMembershipDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.customersService.upgradeMembership(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerMembership',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Membership upgraded', data };
  }

  @Post(':id/activate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Activate customer' })
  async activate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.customersService.setStatus(id, CustomerStatus.ACTIVE);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerStatus',
      resourceId: id,
      newValue: { status: 'ACTIVE' },
    });
    return { success: true, message: 'Customer activated', data };
  }

  @Post(':id/disable')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Disable customer' })
  async disable(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.customersService.setStatus(
      id,
      CustomerStatus.SUSPENDED,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerStatus',
      resourceId: id,
      newValue: { status: 'SUSPENDED' },
    });
    return { success: true, message: 'Customer disabled', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Soft delete customer' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.customersService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'Customer',
      resourceId: id,
    });
    return { success: true, message: 'Customer deleted', data };
  }
}
