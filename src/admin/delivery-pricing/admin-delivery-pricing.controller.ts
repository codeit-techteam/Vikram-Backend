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
import { SWAGGER_BEARER_AUTH } from '../../common/constants/swagger.constants';
import { AdminJwtAuthGuard } from '../guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { AdminRoles } from '../decorators/admin-roles.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { ROLE_GROUPS } from '../constants/admin-rbac.constants';
import type { AuthenticatedAdmin } from '../auth/admin-jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { DeliveryPricingService } from '../../modules/delivery/delivery-pricing.service';
import {
  CreateDeliveryPricingDto,
  DeliveryPricingListQueryDto,
  UpdateDeliveryBenefitConfigDto,
  UpdateDeliveryPricingDto,
  UpdateDeliveryPricingStatusDto,
} from '../../modules/delivery/dto/delivery-pricing.dto';
import { AuditAction } from '../../../generated/prisma/client';

@ApiTags('Admin Delivery Pricing')
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller({ path: 'admin/delivery-pricing', version: '1' })
export class AdminDeliveryPricingController {
  constructor(
    private readonly pricingService: DeliveryPricingService,
    private readonly auditService: AuditService,
  ) {}

  private actor(admin: AuthenticatedAdmin) {
    return {
      id: admin.id,
      name: admin.email || 'Admin',
    };
  }

  @Get('summary')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Delivery pricing dashboard summary cards' })
  async summary() {
    const data = await this.pricingService.getSummary();
    return { success: true, message: 'Delivery pricing summary', data };
  }

  @Get('benefit-config')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Customer delivery benefits configuration' })
  async benefitConfig() {
    const data = await this.pricingService.getBenefitConfig();
    return { success: true, message: 'Delivery benefit config', data };
  }

  @Put('benefit-config')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update free bike delivery benefit configuration' })
  async updateBenefitConfig(
    @Body() dto: UpdateDeliveryBenefitConfigDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.pricingService.getBenefitConfig();
    const data = await this.pricingService.updateBenefitConfig(
      dto,
      this.actor(admin),
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'DeliveryBenefitConfig',
      resourceId: data.id,
      oldValue: before,
      newValue: data,
    });
    return { success: true, message: 'Benefit config updated', data };
  }

  @Get()
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'List all delivery pricing rules' })
  async list(@Query() query: DeliveryPricingListQueryDto) {
    const data = await this.pricingService.listRules(query);
    return { success: true, message: 'Delivery pricing rules', data };
  }

  @Get(':id/history')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Pricing change history for a rule' })
  async history(@Param('id') id: string) {
    const data = await this.pricingService.getHistory(id);
    return { success: true, message: 'Delivery pricing history', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.WAREHOUSE)
  @ApiOperation({ summary: 'Get delivery pricing rule' })
  async getById(@Param('id') id: string) {
    const data = await this.pricingService.getRuleById(id);
    return { success: true, message: 'Delivery pricing rule', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create delivery pricing rule' })
  async create(
    @Body() dto: CreateDeliveryPricingDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.pricingService.createRule(dto, this.actor(admin));
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.CREATE,
      resource: 'DeliveryPricingRule',
      resourceId: data.id,
      newValue: data,
    });
    return { success: true, message: 'Pricing rule created', data };
  }

  @Put(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update delivery pricing rule' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryPricingDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.pricingService.getRuleById(id);
    const data = await this.pricingService.updateRule(
      id,
      dto,
      this.actor(admin),
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'DeliveryPricingRule',
      resourceId: id,
      oldValue: before,
      newValue: data,
    });
    return { success: true, message: 'Pricing rule updated', data };
  }

  @Patch(':id/status')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Activate / deactivate pricing rule' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryPricingStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.pricingService.getRuleById(id);
    const data = await this.pricingService.updateStatus(
      id,
      dto.status,
      this.actor(admin),
      dto.reason,
    );
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.UPDATE,
      resource: 'DeliveryPricingRule',
      resourceId: id,
      oldValue: before,
      newValue: data,
    });
    return { success: true, message: 'Pricing rule status updated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Deactivate pricing rule (soft delete)' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const before = await this.pricingService.getRuleById(id);
    const data = await this.pricingService.deleteRule(id, this.actor(admin));
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: AuditAction.DELETE,
      resource: 'DeliveryPricingRule',
      resourceId: id,
      oldValue: before,
      newValue: data,
    });
    return { success: true, message: 'Pricing rule deactivated', data };
  }
}
