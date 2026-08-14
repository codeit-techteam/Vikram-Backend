import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { AuditService } from '../audit/audit.service';
import { AdminDeliveryPromotionsService } from './admin-delivery-promotions.service';
import {
  CreateDeliveryPromotionDto,
  UpdateDeliveryPromotionDto,
} from './dto/admin-delivery-promotions.dto';

@ApiTags('Admin Delivery Promotions')
@Controller({ version: '1', path: 'admin/delivery-promotions' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminDeliveryPromotionsController {
  constructor(
    private readonly promotions: AdminDeliveryPromotionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List delivery promotions' })
  async findAll() {
    const data = await this.promotions.findAll();
    return { success: true, message: 'Delivery promotions fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Get delivery promotion by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.promotions.findOne(id);
    return { success: true, message: 'Delivery promotion fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Create delivery promotion' })
  async create(
    @Body() dto: CreateDeliveryPromotionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.promotions.create(dto, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'DeliveryPromotion',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Delivery promotion created', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Update delivery promotion' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryPromotionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const previous = await this.promotions.findOne(id);
    const data = await this.promotions.update(id, dto, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'DeliveryPromotion',
      resourceId: id,
      oldValue: previous,
      newValue: dto,
    });
    return { success: true, message: 'Delivery promotion updated', data };
  }

  @Patch(':id/publish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Publish / activate delivery promotion' })
  async publish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.promotions.publish(id, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'DeliveryPromotion',
      resourceId: id,
    });
    return { success: true, message: 'Delivery promotion published', data };
  }

  @Patch(':id/unpublish')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Unpublish / deactivate delivery promotion' })
  async unpublish(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.promotions.unpublish(id, admin.id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'DeliveryPromotion',
      resourceId: id,
    });
    return { success: true, message: 'Delivery promotion unpublished', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'Delete delivery promotion' })
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.promotions.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'DeliveryPromotion',
      resourceId: id,
      oldValue: data,
    });
    return { success: true, message: 'Delivery promotion deleted', data };
  }
}
