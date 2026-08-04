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
import { AuditService } from '../audit/audit.service';
import { AdminPromotionalCardsService } from './admin-promotional-cards.service';
import {
  CreatePromotionalCardDto,
  UpdatePromotionalCardDto,
} from './dto/admin-promotional-cards.dto';

@ApiTags('Admin Promotional Cards')
@Controller({ version: '1', path: 'admin/promotional-cards' })
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@ApiBearerAuth(SWAGGER_BEARER_AUTH)
export class AdminPromotionalCardsController {
  constructor(
    private readonly cardsService: AdminPromotionalCardsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  @ApiOperation({ summary: 'List promotional cards' })
  async findAll(@Query('cardType') cardType?: string) {
    const data = await this.cardsService.findAll(cardType);
    return { success: true, message: 'Promotional cards fetched', data };
  }

  @Get(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async findOne(@Param('id') id: string) {
    const data = await this.cardsService.findOne(id);
    return { success: true, message: 'Promotional card fetched', data };
  }

  @Post()
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async create(
    @Body() dto: CreatePromotionalCardDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cardsService.create(dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'CREATE',
      resource: 'PromotionalCard',
      resourceId: data.id,
      newValue: dto,
    });
    return { success: true, message: 'Promotional card created', data };
  }

  @Post('reorder')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async reorder(
    @Body() body: { items: Array<{ id: string; displayOrder: number }> },
  ) {
    const data = await this.cardsService.reorder(body.items);
    return { success: true, message: 'Promotional cards reordered', data };
  }

  @Patch(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionalCardDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cardsService.update(id, dto);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UPDATE',
      resource: 'PromotionalCard',
      resourceId: id,
      newValue: dto,
    });
    return { success: true, message: 'Promotional card updated', data };
  }

  @Patch(':id/activate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async activate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cardsService.activate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'PUBLISH',
      resource: 'PromotionalCard',
      resourceId: id,
    });
    return { success: true, message: 'Promotional card activated', data };
  }

  @Patch(':id/deactivate')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async deactivate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cardsService.deactivate(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'UNPUBLISH',
      resource: 'PromotionalCard',
      resourceId: id,
    });
    return { success: true, message: 'Promotional card deactivated', data };
  }

  @Delete(':id')
  @AdminRoles(...ROLE_GROUPS.SUPER_ADMIN_ONLY)
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    const data = await this.cardsService.remove(id);
    await this.auditService.log({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'DELETE',
      resource: 'PromotionalCard',
      resourceId: id,
    });
    return { success: true, message: 'Promotional card deleted', data };
  }
}
