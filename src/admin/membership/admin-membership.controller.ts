import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import { AdminMembershipService } from './admin-membership.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto, MembershipQueryDto } from './dto/admin-membership.dto';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';

@ApiTags('Admin Membership')
@Controller({ version: '1', path: 'admin/memberships' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminMembershipController {
  constructor(
    private readonly membershipService: AdminMembershipService,
    private readonly auditService: AuditService,
  ) {}

  @Get('plans')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all membership plans' })
  async findAllPlans() {
    const data = await this.membershipService.findAllPlans();
    return { success: true, message: 'Plans fetched', data };
  }

  @Post('plans')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create a membership plan' })
  async createPlan(@Body() dto: CreateMembershipPlanDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.createPlan(dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CREATE', resource: 'MembershipPlan', resourceId: data.id, newValue: dto });
    return { success: true, message: 'Plan created', data };
  }

  @Get('plans/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get membership plan by ID' })
  async findPlan(@Param('id') id: string) {
    const data = await this.membershipService.findPlan(id);
    return { success: true, message: 'Plan fetched', data };
  }

  @Patch('plans/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update membership plan' })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdateMembershipPlanDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.updatePlan(id, dto);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'MembershipPlan', resourceId: id, newValue: dto });
    return { success: true, message: 'Plan updated', data };
  }

  @Delete('plans/:id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Deactivate membership plan' })
  async deletePlan(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.deletePlan(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'DELETE', resource: 'MembershipPlan', resourceId: id });
    return { success: true, message: 'Plan deactivated', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List all customer memberships' })
  async findAll(@Query() query: MembershipQueryDto) {
    const data = await this.membershipService.findAllCustomerMemberships(query);
    return { success: true, message: 'Memberships fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get customer membership by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.membershipService.findCustomerMembership(id);
    return { success: true, message: 'Membership fetched', data };
  }

  @Patch(':id/approve')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Approve membership payment' })
  async approve(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.approveMembership(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'APPROVE', resource: 'CustomerMembership', resourceId: id });
    return { success: true, message: 'Membership approved', data };
  }

  @Patch(':id/cancel')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Cancel customer membership' })
  async cancel(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.cancelMembership(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'CANCEL', resource: 'CustomerMembership', resourceId: id });
    return { success: true, message: 'Membership cancelled', data };
  }

  @Patch(':id/renew')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Renew customer membership' })
  async renew(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    const data = await this.membershipService.renewMembership(id);
    await this.auditService.log({ adminUserId: admin.id, adminEmail: admin.email, action: 'UPDATE', resource: 'CustomerMembership', resourceId: id });
    return { success: true, message: 'Membership renewed', data };
  }
}
