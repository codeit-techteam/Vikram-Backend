import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminCustomersService } from './admin-customers.service';
import { AdminCustomerQueryDto, AdminUpdateCustomerDto } from './dto/admin-customers.dto';
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
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all customers with filters and pagination' })
  async findAll(@Query() query: AdminCustomerQueryDto) {
    const data = await this.customersService.findAll(query);
    return { success: true, message: 'Customers fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
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
