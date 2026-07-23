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
import { CustomerStatus } from '../../../generated/prisma/client';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminCustomersService } from './admin-customers.service';
import {
  AdminCustomerQueryDto,
  AdminSetStatusDto,
  AdminUpdateCustomerDto,
  AdminUpgradeMembershipDto,
} from './dto/admin-customers.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Customers')
@Controller({ version: '1', path: 'admin/customers' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminCustomersController {
  constructor(
    private readonly customersService: AdminCustomersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'List all customers with filters and pagination' })
  async findAll(@Query() query: AdminCustomerQueryDto) {
    const data = await this.customersService.findAll(query);
    return { success: true, message: 'Customers fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.CUSTOMER_EXECUTIVE)
  @ApiOperation({ summary: 'Get customer details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.customersService.findOne(id);
    return { success: true, message: 'Customer fetched', data };
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
      CustomerStatus.INACTIVE,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'CustomerStatus',
      resourceId: id,
      newValue: { status: 'INACTIVE' },
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
